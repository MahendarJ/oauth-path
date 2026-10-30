import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { generateJson } from "./llm";
import { webSearch } from "./search";
import { htmlToText } from "./fetch-sources";
import { MAX_DOC_BYTES, safeFetch, validateSafeUrl } from "../probes/ssrf";

const nullableUrl = z.string().url().nullable().default(null);

/**
 * Model output for prompts/resolve.md v3. Every URL here is a candidate only;
 * resolveApp fetches and verifies each one before anything downstream sees it.
 */
export const ResolveOutputSchema = z.object({
  app: z.string().min(1, "app is required"),
  slug: z.string().regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, digits and hyphens"),
  composioSlugGuess: z.string().regex(/^[a-z0-9_]+$/, "composioSlugGuess must be lowercase with underscores"),
  apiOrigin: nullableUrl,
  authOrigin: nullableUrl,
  authorizationEndpoint: nullableUrl,
  supportsOAuth: z.enum(["yes", "no", "unknown"]),
  confidence: z.enum(["high", "medium", "low"]),
  officialUrls: z.object({
    developerPortal: nullableUrl,
    oauthDocs: z.array(z.string().url()).default([]),
    appReview: z.array(z.string().url()).default([]),
    scopes: nullableUrl,
    redirectUriRules: nullableUrl,
    pricingOrAccess: nullableUrl,
  }),
  communityUrls: z.array(z.string().url()).max(2).default([]),
  alternatives: z.array(z.object({ name: z.string(), why: z.string() })).default([]),
  notes: z.string().default(""),
});
export type ResolveOutput = z.infer<typeof ResolveOutputSchema>;

/** What the rest of the pipeline consumes. Built in code from verified URLs only. */
export interface ResolvedApp {
  appName: string;
  slug: string;
  composioSlugGuess: string;
  origin: string;
  authOrigin?: string;
  authorizationEndpoint?: string;
  officialUrls: string[];
  communityUrls: string[];
  supportsOAuth: "yes" | "no" | "unknown";
  confidence: "high" | "medium" | "low";
  alternatives: { name: string; why: string }[];
  notes: string;
  inputMode: "search" | "url";
}

const MAX_REDIRECTS = 5;
const MIN_USEFUL_CHARS = 200;
const MAX_LINKS = 200;
const MAX_DOMAIN_SEARCH_PAGES = 3;

/** Approximate registrable domain (eTLD+1) without a public-suffix list. */
export function registrableDomain(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, "").split(".");
  if (labels.length <= 2) return labels.join(".");
  const sld = labels[labels.length - 2];
  const twoPartSuffix = ["co", "com", "net", "org", "gov", "ac", "edu"].includes(sld) && labels[labels.length - 1].length === 2;
  return labels.slice(twoPartSuffix ? -3 : -2).join(".");
}

/** Removes URLs that differ only by a trailing slash, keeping the first spelling. */
function dedupeUrls(urls: string[]): string[] {
  const seen = new Set<string>();
  return urls.filter((u) => {
    const key = u.replace(/\/+$/, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Turns typed input into an https URL, or null when it is an app name. */
export function inputAsUrl(input: string): string | null {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed.replace(/^http:\/\//i, "https://");
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

interface FetchedPage {
  finalUrl: string;
  html: string;
}

/**
 * Fetches a URL with the SSRF-guarded fetcher, following redirects by hand so every hop
 * is guarded and checked against allowedDomains. Throws with a reason on failure.
 */
async function fetchVerified(url: string, allowedDomains: Set<string>): Promise<FetchedPage> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const domain = registrableDomain(new URL(current).hostname);
    if (!allowedDomains.has(domain)) {
      throw new Error(hop === 0 ? `not on provider domain (${domain})` : `redirected off provider domain to ${domain}`);
    }
    const res = await safeFetch(current, { headers: { Accept: "text/html,application/xhtml+xml,*/*" }, maxBytes: MAX_DOC_BYTES });
    if (res.status >= 300 && res.status < 400) {
      if (!res.location?.rawLocation) throw new Error(`HTTP ${res.status} without Location`);
      current = new URL(res.location.rawLocation, current).toString();
      continue;
    }
    if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
    const title = res.data.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
    if (/\b404\b|not found/i.test(title)) throw new Error(`soft 404 (title: "${title.trim()}")`);
    if (htmlToText(res.data).length < MIN_USEFUL_CHARS) throw new Error("page has no useful text");
    return { finalUrl: current, html: res.data };
  }
  throw new Error(`more than ${MAX_REDIRECTS} redirects`);
}

/** Extracts https links (url + link text) from a page, resolved against its URL. */
export function extractLinks(html: string, baseUrl: string): { url: string; text: string }[] {
  const seen = new Set<string>();
  const links: { url: string; text: string }[] = [];
  const anchor = /<a\b[^>]*?\bhref\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchor)) {
    let url: URL;
    try {
      url = new URL(match[1].replace(/&amp;/g, "&"), baseUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "https:") continue;
    if (/\.(png|jpe?g|gif|svg|webp|ico|css|js|zip|mp4)$/i.test(url.pathname)) continue;
    url.hash = "";
    const key = url.toString();
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ url: key, text: htmlToText(match[2]).slice(0, 120) });
    if (links.length >= MAX_LINKS) break;
  }
  return links;
}

/** Calls the model, validates with Zod, and allows one repair retry. */
async function callResolveModel(system: string, payload: Record<string, unknown>): Promise<ResolveOutput> {
  const firstResult = await generateJson<unknown>({ system, user: JSON.stringify(payload) });
  const parsed = ResolveOutputSchema.safeParse(firstResult);
  if (parsed.success) return parsed.data;

  const repairUser = JSON.stringify({ ...payload, error: JSON.stringify(parsed.error.format()), repair: true });
  const repairResult = await generateJson<unknown>({ system, user: repairUser });
  const repairedParsed = ResolveOutputSchema.safeParse(repairResult);
  if (repairedParsed.success) return repairedParsed.data;

  throw new Error(
    `Resolve stage failed validation after repair retry: ${JSON.stringify(repairedParsed.error.format())}`
  );
}

function domainOf(url: string | null): string | null {
  return url ? registrableDomain(new URL(url).hostname) : null;
}

export async function resolveApp(input: string): Promise<ResolvedApp> {
  const system = fs.readFileSync(path.join(process.cwd(), "prompts/resolve.md"), "utf-8");
  const seedInput = inputAsUrl(input);

  let output: ResolveOutput;
  let seed: FetchedPage | null = null;
  let allowedLinks: Set<string> | null = null;

  if (!seedInput) {
    // Name input: search with Tavily, then the model may only pick from the search results.
    const queries = [`${input} OAuth developer documentation`, `${input} API create app authorization scopes`];
    const results = (await Promise.all(queries.map((q) => webSearch(q)))).flat();
    const seen = new Set<string>();
    const links = results.filter((r) => {
      const url = new URL(r.url);
      url.hash = "";
      r.url = url.toString();
      if (seen.has(r.url)) return false;
      seen.add(r.url);
      return true;
    });
    if (links.length === 0) {
      throw new Error(`Search found no results for "${input}". Paste the provider's developer docs URL instead.`);
    }
    allowedLinks = new Set(links.map((l) => l.url));
    console.log(`[Resolve] mode=choose (search) query="${input}" results=${links.length}`);
    console.log(`[Resolve] search results: ${JSON.stringify(links.map((l) => l.url), null, 2)}`);
    output = await callResolveModel(system, { mode: "choose", query: input, seedUrl: null, links });
  } else {
    // URL input: fetch the seed, extract links in code, the model may only pick from them.
    try {
      const seedDomain = registrableDomain(new URL(seedInput).hostname);
      seed = await fetchVerified(seedInput, new Set([seedDomain]));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Could not fetch "${seedInput}" (${msg}). Paste the provider's developer docs URL instead.`);
    }
    const links = extractLinks(seed.html, seed.finalUrl);
    allowedLinks = new Set(links.map((l) => l.url));
    console.log(`[Resolve] mode=choose (url) seed=${seed.finalUrl} links extracted=${links.length}`);
    output = await callResolveModel(system, { mode: "choose", query: input, seedUrl: seed.finalUrl, links });
  }

  const o = output.officialUrls;
  const proposedOfficial = [
    o.developerPortal,
    ...o.oauthDocs,
    ...o.appReview,
    o.scopes,
    o.redirectUriRules,
    o.pricingOrAccess,
  ].filter((u): u is string => !!u);
  const proposedCommunity = output.communityUrls;
  console.log(`[Resolve] model: app="${output.app}" slug=${output.slug} confidence=${output.confidence} supportsOAuth=${output.supportsOAuth}`);
  console.log(`[Resolve] proposed official: ${JSON.stringify(proposedOfficial)}`);
  console.log(`[Resolve] proposed community: ${JSON.stringify(proposedCommunity)}`);

  // Provider domains: the seed (if any), the claimed API/auth origins, and the developer portal.
  const providerDomains = new Set(
    [seed ? domainOf(seed.finalUrl) : null, domainOf(output.apiOrigin), domainOf(output.authOrigin), domainOf(o.developerPortal ?? o.oauthDocs[0] ?? null)]
      .filter((d): d is string => !!d)
  );
  console.log(`[Resolve] provider domains: ${JSON.stringify([...providerDomains])}`);

  const dropped: { url: string; reason: string }[] = [];

  async function verifyAll(urls: string[], domainsFor: (url: string) => Set<string>, onlyFromLinks = true): Promise<string[]> {
    const unique = [...new Set(urls)];
    const results = await Promise.all(
      unique.map(async (url) => {
        if (onlyFromLinks && allowedLinks && !allowedLinks.has(url)) {
          dropped.push({ url, reason: "not in extracted links (choose mode)" });
          return null;
        }
        try {
          return (await fetchVerified(url, domainsFor(url))).finalUrl;
        } catch (err: unknown) {
          dropped.push({ url, reason: err instanceof Error ? err.message : String(err) });
          return null;
        }
      })
    );
    return dedupeUrls(results.filter((u): u is string => !!u));
  }

  const officialUrls = await verifyAll(proposedOfficial, () => providerDomains);

  // Second search, limited to the provider's own domains, for pages the broad search missed
  // (app review, scopes, rate limits, token lifetimes). Results are verified like any other URL.
  if (providerDomains.size > 0) {
    try {
      const extra = await webSearch(
        `${output.app} OAuth app review scopes rate limits refresh token`,
        8,
        [...providerDomains]
      );
      const candidates = extra.map((r) => r.url).filter((u) => !officialUrls.includes(u)).slice(0, MAX_DOMAIN_SEARCH_PAGES);
      console.log(`[Resolve] provider-domain search candidates: ${JSON.stringify(candidates)}`);
      // These come from a search restricted to provider domains, not from the model's choice
      const verified = await verifyAll(candidates, () => providerDomains, false);
      officialUrls.splice(0, officialUrls.length, ...dedupeUrls([...officialUrls, ...verified]));
    } catch (err: unknown) {
      console.warn(`[Resolve] provider-domain search failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // Community threads may live off the provider's domain (e.g. an issue tracker), but may not redirect elsewhere.
  const communityUrls = await verifyAll(proposedCommunity, (url) => new Set([registrableDomain(new URL(url).hostname)]));

  // The seed page itself was fetched and verified and came from the user, so it is a source too.
  if (seed) officialUrls.splice(0, officialUrls.length, ...dedupeUrls([seed.finalUrl, ...officialUrls]));

  console.log(`[Resolve] verified official: ${JSON.stringify(officialUrls)}`);
  console.log(`[Resolve] verified community: ${JSON.stringify(communityUrls)}`);
  console.log(`[Resolve] dropped: ${JSON.stringify(dropped, null, 2)}`);

  if (officialUrls.length === 0) {
    throw new Error(
      `Could not verify any official documentation URL for "${input}". ` +
        `Paste the provider's developer docs URL instead, e.g. npm run generate -- "https://developers.example.com/oauth".`
    );
  }

  // Probe origin: the first claimed origin that passes the SSRF/DNS guard, else the first verified page.
  let origin = new URL(officialUrls[0]).origin;
  for (const candidate of [output.apiOrigin, output.authOrigin]) {
    if (!candidate) continue;
    try {
      await validateSafeUrl(candidate);
      origin = new URL(candidate).origin;
      break;
    } catch {
      console.warn(`[Resolve] origin candidate ${candidate} failed the SSRF/DNS guard, skipping`);
    }
  }

  return {
    appName: output.app,
    slug: output.slug,
    composioSlugGuess: output.composioSlugGuess,
    origin,
    authOrigin: output.authOrigin ?? undefined,
    authorizationEndpoint: output.authorizationEndpoint ?? undefined,
    officialUrls,
    communityUrls,
    supportsOAuth: output.supportsOAuth,
    confidence: output.confidence,
    alternatives: output.alternatives,
    notes: output.notes,
    inputMode: seed ? "url" : "search",
  };
}
