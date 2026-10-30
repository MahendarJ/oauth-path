import * as dns from "dns/promises";
import * as net from "net";

const MAX_RESPONSE_BYTES = 1024 * 1024; // 1MB default (probes)
/** Documentation pages can be large single-page API references; their text is truncated after fetching. */
export const MAX_DOC_BYTES = 5 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8000; // 8 seconds

const BLOCKED_HOST_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home",
  ".corp",
  ".test",
  ".example",
  ".invalid",
];

/**
 * Checks whether an IPv4 or IPv6 address is private, loopback, link-local, or reserved.
 */
export function isPrivateOrBlockedIP(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 0) return true; // not a valid IP

  if (version === 4) {
    const parts = ip.split(".").map((p) => parseInt(p, 10));
    if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) {
      return true;
    }

    const [a, b, c, d] = parts;

    // 0.0.0.0/8 (Current network)
    if (a === 0) return true;
    // 10.0.0.0/8 (Private)
    if (a === 10) return true;
    // 100.64.0.0/10 (Carrier-grade NAT)
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 (Loopback / localhost)
    if (a === 127) return true;
    // 169.254.0.0/16 (Link-local)
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 (Private)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24 (IETF Protocol Assignments)
    if (a === 192 && b === 0 && c === 0) return true;
    // 192.0.2.0/24 (TEST-NET-1)
    if (a === 192 && b === 0 && c === 2) return true;
    // 192.168.0.0/16 (Private)
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 (Benchmarking)
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 (TEST-NET-2)
    if (a === 198 && b === 51 && c === 100) return true;
    // 203.0.113.0/24 (TEST-NET-3)
    if (a === 203 && b === 0 && c === 113) return true;
    // 224.0.0.0/4 (Multicast)
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 (Reserved / Broadcast)
    if (a >= 240) return true;

    return false;
  }

  if (version === 6) {
    const normalized = ip.toLowerCase();

    // ::1 loopback
    if (normalized === "::1" || normalized === "0000:0000:0000:0000:0000:0000:0000:0001") {
      return true;
    }
    // :: unspecified
    if (normalized === "::" || normalized === "0000:0000:0000:0000:0000:0000:0000:0000") {
      return true;
    }

    // IPv4-mapped IPv6 (::ffff:192.0.2.1)
    if (normalized.startsWith("::ffff:")) {
      const v4Part = normalized.substring(7);
      if (net.isIPv4(v4Part)) {
        return isPrivateOrBlockedIP(v4Part);
      }
    }

    // fc00::/7 (Unique local / private: fc00 to fdff)
    if (normalized.startsWith("fc") || normalized.startsWith("fd")) {
      return true;
    }

    // fe80::/10 (Link-local: fe8 to feb)
    if (
      normalized.startsWith("fe8") ||
      normalized.startsWith("fe9") ||
      normalized.startsWith("fea") ||
      normalized.startsWith("feb")
    ) {
      return true;
    }

    return false;
  }

  return true;
}

/**
 * Validates a target URL against SSRF rules:
 * - Must use HTTPS protocol
 * - Must not be localhost, loopback, or private hostnames
 * - Resolves DNS to ensure no private/link-local/internal IP addresses
 */
export async function validateSafeUrl(urlString: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new Error(`Invalid URL format: "${urlString}"`);
  }

  // 1. HTTPS only
  if (parsed.protocol !== "https:") {
    throw new Error(`SSRF Guard: Non-HTTPS protocol rejected (${parsed.protocol})`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject localhost & non-public hostnames
  if (hostname === "localhost") {
    throw new Error(`SSRF Guard: "localhost" is rejected`);
  }

  for (const suffix of BLOCKED_HOST_SUFFIXES) {
    if (hostname.endsWith(suffix)) {
      throw new Error(`SSRF Guard: Non-public hostname rejected (${hostname})`);
    }
  }

  // 3. Check if hostname is directly an IP literal
  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIP(hostname)) {
      throw new Error(`SSRF Guard: Private/loopback/link-local IP rejected (${hostname})`);
    }
    return parsed;
  }

  // 4. Resolve DNS and inspect all resolved addresses
  try {
    const addresses = await dns.lookup(hostname, { all: true });
    if (!addresses || addresses.length === 0) {
      throw new Error(`SSRF Guard: DNS lookup returned no addresses for ${hostname}`);
    }

    for (const record of addresses) {
      if (isPrivateOrBlockedIP(record.address)) {
        throw new Error(
          `SSRF Guard: Domain ${hostname} resolved to blocked IP ${record.address}`
        );
      }
    }
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("SSRF Guard:")) {
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`SSRF Guard: DNS resolution failed for ${hostname}: ${message}`);
  }

  return parsed;
}

export interface SafeLocationInfo {
  rawLocation?: string;
  host?: string;
  path?: string;
  redactedLocation?: string;
}

export interface SafeFetchResponse {
  status: number;
  statusText: string;
  headers: Headers;
  data: string;
  json: unknown | null;
  location?: SafeLocationInfo;
}

/**
 * Redacts query parameter values in a URL string.
 */
export function redactUrlQuery(rawUrl: string, baseOrigin?: string): SafeLocationInfo {
  try {
    const parsed = baseOrigin ? new URL(rawUrl, baseOrigin) : new URL(rawUrl);
    const redactedParams = new URLSearchParams();
    for (const [key] of parsed.searchParams.entries()) {
      redactedParams.set(key, "[REDACTED]");
    }
    const search = redactedParams.toString() ? `?${redactedParams.toString()}` : "";
    return {
      rawLocation: rawUrl,
      host: parsed.host,
      path: parsed.pathname,
      redactedLocation: `${parsed.origin}${parsed.pathname}${search}`,
    };
  } catch {
    // If not a parseable URL, return path as raw string with query redacted
    const [pathPart, queryPart] = rawUrl.split("?");
    let redactedQuery = "";
    if (queryPart) {
      const sp = new URLSearchParams(queryPart);
      const redacted = new URLSearchParams();
      for (const [key] of sp.entries()) {
        redacted.set(key, "[REDACTED]");
      }
      redactedQuery = `?${redacted.toString()}`;
    }
    return {
      rawLocation: rawUrl,
      path: pathPart,
      redactedLocation: `${pathPart}${redactedQuery}`,
    };
  }
}

/**
 * Safe fetch conforming to:
 * - HTTPS only & DNS SSRF checks
 * - 8s timeout
 * - 1MB response cap
 * - No cookies
 * - redirect: "manual" (records Location host and path with redacted query params)
 * - GET only, never sends credentials
 */
export async function safeFetch(
  urlString: string,
  init?: { headers?: Record<string, string>; maxBytes?: number }
): Promise<SafeFetchResponse> {
  const maxBytes = init?.maxBytes ?? MAX_RESPONSE_BYTES;
  const safeUrl = await validateSafeUrl(urlString);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(safeUrl.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json, text/plain, */*",
        "User-Agent": "OAuthPath-Probe/1.0",
        ...(init?.headers || {}),
      },
      redirect: "manual",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Extract and redact Location header for redirects
    let locationInfo: SafeLocationInfo | undefined;
    const locationHeader = response.headers.get("location");
    if (locationHeader) {
      locationInfo = redactUrlQuery(locationHeader, safeUrl.origin);
    }

    // Check Content-Length cap if provided
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      throw new Error(`Response exceeds ${maxBytes} byte cap (Content-Length: ${contentLength} bytes)`);
    }

    // Read response body with 1MB cap
    let bodyText = "";
    if (response.body) {
      const reader = response.body.getReader();
      let bytesRead = 0;
      const chunks: Uint8Array[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          bytesRead += value.length;
          if (bytesRead > maxBytes) {
            reader.cancel();
            throw new Error(`Response exceeded ${maxBytes} byte cap during streaming`);
          }
          chunks.push(value);
        }
      }

      const merged = new Uint8Array(bytesRead);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
      }
      bodyText = new TextDecoder().decode(merged);
    }

    let parsedJson: unknown = null;
    try {
      if (bodyText.trim().startsWith("{") || bodyText.trim().startsWith("[")) {
        parsedJson = JSON.parse(bodyText);
      }
    } catch {
      // not valid JSON
    }

    return {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
      data: bodyText,
      json: parsedJson,
      location: locationInfo,
    };
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  }
}
