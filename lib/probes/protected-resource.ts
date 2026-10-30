import { safeFetch } from "./ssrf";
import { ProbeObservation } from "./types";

export async function protectedResource(origin: string): Promise<ProbeObservation> {
  const cleanOrigin = origin.replace(/\/+$/, "");
  const targetUrl = `${cleanOrigin}/.well-known/oauth-protected-resource`;
  const checkedAt = new Date().toISOString();

  try {
    const res = await safeFetch(targetUrl);
    const facts: Record<string, unknown> = {
      advertised: res.status >= 200 && res.status < 300,
      statusCode: res.status,
      metadata: res.json,
    };

    return {
      probe: "protectedResource",
      url: targetUrl,
      checkedAt,
      status: res.status,
      facts,
      evidence: "tested",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      probe: "protectedResource",
      url: targetUrl,
      checkedAt,
      status: "error",
      error: message,
      facts: {
        advertised: false,
      },
      evidence: "tested",
    };
  }
}
