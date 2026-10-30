const TAVILY_URL = "https://api.tavily.com/search";
const REQUEST_TIMEOUT_MS = 20_000;

export interface SearchResult {
  url: string;
  text: string;
}

/**
 * Web search via Tavily. Returns result URLs with their titles as link text.
 * Results are candidates only; resolveApp fetches and verifies every URL it keeps.
 */
export async function webSearch(query: string, maxResults = 8, includeDomains?: string[]): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error("Missing TAVILY_API_KEY environment variable. Please set it in .env or your environment.");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(TAVILY_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        query,
        max_results: maxResults,
        search_depth: "basic",
        ...(includeDomains?.length ? { include_domains: includeDomains } : {}),
      }),
      signal: controller.signal,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error && err.name === "AbortError" ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : String(err);
    throw new Error(`Tavily search failed: ${msg}`);
  } finally {
    clearTimeout(timeoutId);
  }

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`Tavily search failed: HTTP ${res.status}\n${body.split(apiKey).join("[REDACTED]").slice(0, 1000)}`);
  }

  const data = JSON.parse(body) as { results?: { url?: string; title?: string }[] };
  return (data.results ?? [])
    .filter((r): r is { url: string; title?: string } => typeof r.url === "string" && r.url.startsWith("https://"))
    .map((r) => ({ url: r.url, text: (r.title ?? "").slice(0, 120) }));
}
