import * as fs from "fs";
import * as path from "path";
import { ComposioTrack, ProbeObservation } from "./types";

const SNAPSHOT_DATE = "2026-10-30";
const SOURCE_URL = "https://docs.composio.dev/toolkits/managed-auth";

let managedSlugsCache: Set<string> | null = null;
let byoSlugsCache: Set<string> | null = null;

function loadSlugSets() {
  if (!managedSlugsCache || !byoSlugsCache) {
    const dataDir = path.join(process.cwd(), "data");
    const managedPath = path.join(dataDir, "managed-slugs.json");
    const byoPath = path.join(dataDir, "byo-slugs.json");

    try {
      const managedData = JSON.parse(fs.readFileSync(managedPath, "utf-8")) as string[];
      managedSlugsCache = new Set(managedData.map((s) => s.toLowerCase()));
    } catch {
      managedSlugsCache = new Set();
    }

    try {
      const byoData = JSON.parse(fs.readFileSync(byoPath, "utf-8")) as string[];
      byoSlugsCache = new Set(byoData.map((s) => s.toLowerCase()));
    } catch {
      byoSlugsCache = new Set();
    }
  }
  return { managed: managedSlugsCache, byo: byoSlugsCache };
}

/**
 * Normalizes tool/app slug for matching (e.g. spotify, linear, etc.)
 */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.(com|app|dev|org|net|io)$/, "")
    .replace(/^(accounts\.|api\.|dev\.)/, "")
    .replace(/[^a-z0-9_]/g, "_");
}

function resolveTrackFromLists(slug: string, managed: Set<string>, byo: Set<string>): ComposioTrack {
  if (managed.has(slug)) return "managed";
  if (byo.has(slug)) return "bring-your-own";
  return "unknown";
}

export async function composioTrack(slug: string): Promise<ProbeObservation> {
  const checkedAt = new Date().toISOString();
  const normalized = normalizeSlug(slug);
  const mcpSlug = normalized.endsWith("_mcp") ? normalized : `${normalized}_mcp`;
  const composioApiKey = process.env.COMPOSIO_API_KEY;

  let track: ComposioTrack = "unknown";
  let mcpTrack: ComposioTrack = "unknown";
  let source = SOURCE_URL;

  const { managed, byo } = loadSlugSets();

  track = resolveTrackFromLists(normalized, managed, byo);
  mcpTrack = resolveTrackFromLists(mcpSlug, managed, byo);

  if (composioApiKey) {
    try {
      const response = await fetch(`https://backend.composio.dev/api/v1/toolkits/${normalized}`, {
        headers: {
          "x-api-key": composioApiKey,
        },
      });
      if (response.ok) {
        const body = (await response.json()) as {
          composio_managed_auth_schemes?: string[];
        };
        const schemes = body.composio_managed_auth_schemes || [];
        track = schemes.some((s) => s.toLowerCase().includes("oauth"))
          ? "managed"
          : "bring-your-own";
        source = "https://backend.composio.dev/api/v1/toolkits";
      }
    } catch {
      // Fallback to local snapshot
    }
  }

  const facts: Record<string, unknown> = {
    slug: normalized,
    track,
    snapshotDate: SNAPSHOT_DATE,
    source,
    managedOAuthAvailable: track === "managed",
  };

  // If mcp slug was found and differs from base slug, report both
  if (mcpTrack !== "unknown" && mcpTrack !== track) {
    facts.mcpSlug = mcpSlug;
    facts.mcpTrack = mcpTrack;
    facts.tracksDiffer = true;
    facts.note = `Base slug '${normalized}' is ${track}, while '${mcpSlug}' is ${mcpTrack}.`;
  } else if (mcpTrack !== "unknown") {
    facts.mcpSlug = mcpSlug;
    facts.mcpTrack = mcpTrack;
    facts.tracksDiffer = false;
  }

  return {
    probe: "composioTrack",
    url: SOURCE_URL,
    checkedAt,
    status: "ok",
    facts,
    evidence: "doc-confirmed",
  };
}
