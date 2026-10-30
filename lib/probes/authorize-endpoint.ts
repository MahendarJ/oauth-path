import { safeFetch } from "./ssrf";
import { ProbeObservation } from "./types";

export type AuthorizeClassification = "login-redirect" | "client-error" | "other";

export async function authorizeEndpoint(url: string): Promise<ProbeObservation> {
  const checkedAt = new Date().toISOString();
  const targetUrl = new URL(url);
  targetUrl.searchParams.set("client_id", "INVALID");
  targetUrl.searchParams.set("response_type", "code");
  targetUrl.searchParams.set("redirect_uri", "https://example.com/callback");

  try {
    const res = await safeFetch(targetUrl.toString());

    let classification: AuthorizeClassification = "other";
    const isRedirect = [301, 302, 303, 307, 308].includes(res.status);

    if (isRedirect && res.location) {
      const locPath = (res.location.path || "").toLowerCase();
      const locHost = (res.location.host || "").toLowerCase();
      const rawLoc = (res.location.rawLocation || "").toLowerCase();

      // If redirected to login/signin
      if (
        locPath.includes("login") ||
        locPath.includes("signin") ||
        locHost.includes("login") ||
        rawLoc.includes("/login") ||
        rawLoc.includes("/signin")
      ) {
        classification = "login-redirect";
      } else if (rawLoc.includes("error=") || rawLoc.includes("invalid_client")) {
        classification = "client-error";
      } else {
        // Many OAuth servers redirect to login by default on any unauthenticated GET
        classification = "login-redirect";
      }
    } else if (res.status === 400 || res.status === 401 || res.status === 403) {
      classification = "client-error";
    } else {
      const lowerBody = (res.data || "").toLowerCase();
      if (
        lowerBody.includes("invalid client") ||
        lowerBody.includes("client_id") ||
        lowerBody.includes("invalid_request") ||
        lowerBody.includes("unauthorized_client")
      ) {
        classification = "client-error";
      } else if (lowerBody.includes("log in") || lowerBody.includes("sign in")) {
        classification = "login-redirect";
      } else {
        classification = "other";
      }
    }

    const facts: Record<string, unknown> = {
      classification,
      httpStatus: res.status,
      statusText: res.statusText,
      redirectLocation: res.location
        ? {
            host: res.location.host,
            path: res.location.path,
            redactedLocation: res.location.redactedLocation,
          }
        : null,
      note: "A login redirect proves nothing about client validity.",
    };

    return {
      probe: "authorizeEndpoint",
      url: targetUrl.toString(),
      checkedAt,
      status: res.status,
      facts,
      evidence: "tested",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      probe: "authorizeEndpoint",
      url: targetUrl.toString(),
      checkedAt,
      status: "error",
      error: message,
      facts: {
        classification: "other",
        note: "Request failed during probe execution.",
      },
      evidence: "tested",
    };
  }
}
