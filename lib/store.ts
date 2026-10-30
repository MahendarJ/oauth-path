import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { list, put } from "@vercel/blob";
import { Guide, GuideSchema } from "./schema";

/**
 * Where guides live.
 * - Library guides ship with the code in guides/ (read-only on a serverless host).
 * - Guides generated at runtime go to Vercel Blob when BLOB_READ_WRITE_TOKEN is set (deployed),
 *   otherwise to guides/ locally. Without either, a serverless host falls back to the temp dir,
 *   which does not survive a cold start.
 */

const BUNDLED_DIR = path.join(process.cwd(), "guides");
const useBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;
const onServerless = () => !!process.env.VERCEL;
const BLOB_PREFIX = "guides/";

/** Writable scratch directory: .cache locally, the temp dir on a serverless host. */
export function writableDir(...parts: string[]): string {
  const base = onServerless() ? path.join(os.tmpdir(), "oauth-path") : path.join(process.cwd(), ".cache");
  return path.join(base, ...parts);
}

function runtimeDir(): string {
  return onServerless() ? writableDir("guides") : BUNDLED_DIR;
}

function readDir(dir: string): Guide[] {
  if (!fs.existsSync(dir)) return [];
  const guides: Guide[] = [];
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    try {
      const parsed = GuideSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8")));
      if (parsed.success) guides.push(parsed.data);
    } catch {
      // unreadable file: leave it out
    }
  }
  return guides;
}

async function readBlobGuides(): Promise<Guide[]> {
  const { blobs } = await list({ prefix: BLOB_PREFIX });
  const guides = await Promise.all(
    blobs.map(async (b) => {
      try {
        const res = await fetch(b.url, { cache: "no-store" });
        const parsed = GuideSchema.safeParse(await res.json());
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    })
  );
  return guides.filter((g): g is Guide => g !== null);
}

/** All guides; a runtime-generated guide replaces a bundled one with the same slug. */
export async function loadAllGuides(): Promise<Guide[]> {
  const bySlug = new Map<string, Guide>();
  for (const g of readDir(BUNDLED_DIR)) bySlug.set(g.slug, g);
  const runtime = useBlob() ? await readBlobGuides().catch(() => []) : onServerless() ? readDir(runtimeDir()) : [];
  for (const g of runtime) bySlug.set(g.slug, g);
  return [...bySlug.values()];
}

export async function loadGuide(slug: string): Promise<Guide | null> {
  return (await loadAllGuides()).find((g) => g.slug === slug) ?? null;
}

/** Saves a generated guide and returns where it went. */
export async function saveGuide(guide: Guide): Promise<string> {
  const body = JSON.stringify(guide, null, 2);
  if (useBlob()) {
    const blob = await put(`${BLOB_PREFIX}${guide.slug}.json`, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }
  const dir = runtimeDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${guide.slug}.json`);
  fs.writeFileSync(file, body, "utf-8");
  return file;
}
