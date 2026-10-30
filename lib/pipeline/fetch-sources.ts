import * as fs from "fs";
import * as path from "path";
import { safeFetch } from "../probes/ssrf";
import { ResolvedApp } from "./resolve";

export interface SourceSnapshot {
  url: string;
  fetchedAt: string;
  kind: "official" | "community";
  text: string;
}

const MAX_PAGES = 8;
const MAX_CHARS_PER_PAGE = 40_000;

/**
 * Strips HTML tags, styles, scripts, and collapses whitespace into plain text.
 */
export function htmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ")
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, " ")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:p|div|h[1-6]|li|br|tr)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

/**
 * Fetches up to 8 official and community URLs with SSRF guards and saves snapshots to .cache/sources/<slug>/
 */
export async function fetchSourceSnapshots(
  resolved: ResolvedApp,
  cacheDir = path.join(process.cwd(), ".cache/sources")
): Promise<SourceSnapshot[]> {
  const targets: { url: string; kind: "official" | "community" }[] = [
    ...resolved.officialUrls.map((url) => ({ url, kind: "official" as const })),
    ...resolved.communityUrls.map((url) => ({ url, kind: "community" as const })),
  ].slice(0, MAX_PAGES);

  const snapshots: SourceSnapshot[] = [];
  const fetchedAt = new Date().toISOString().split("T")[0];

  for (const target of targets) {
    try {
      const res = await safeFetch(target.url);
      if (res.status >= 200 && res.status < 400 && res.data) {
        const plainText = htmlToText(res.data).slice(0, MAX_CHARS_PER_PAGE);
        if (plainText.length > 0) {
          snapshots.push({
            url: target.url,
            fetchedAt,
            kind: target.kind,
            text: plainText,
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`[Snapshot] Warning: could not fetch ${target.url} (${msg})`);
    }
  }

  // Save snapshots to .cache/sources/<slug>/
  const slugDir = path.join(cacheDir, resolved.slug);
  fs.mkdirSync(slugDir, { recursive: true });

  const manifestPath = path.join(slugDir, "snapshots.json");
  fs.writeFileSync(manifestPath, JSON.stringify(snapshots, null, 2), "utf-8");

  return snapshots;
}
