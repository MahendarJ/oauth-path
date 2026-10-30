import * as fs from "fs";
import * as path from "path";
import { ComposioTrack, ProbeObservation } from "./types";

const SNAPSHOT_DATE = "2026-10-30";

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

export async function composioTrack(slug: string): Promise<ProbeObservation> {
  const checkedAt = new Date().toISOString();
  const normalized = normalizeSlug(slug);
  const composioApiKey = process.env.COMPOSIO_API_KEY;

  let track: ComposioTrack = "unknown";
  let source = "local-snapshot";
  let snapshotDate = SNAPSHOT_DATE;

  if (composioApiKey) {
    try {
      // Swappable live lookup when COMPOSIO_API_KEY is available
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
        source = "composio-api";
      }
    } catch {
      // Fallback to local snapshot if API lookup fails
    }
  }

  // If not resolved via live API, consult local snapshot lists
  if (track === "unknown") {
    const { managed, byo } = loadSlugSets();
    if (managed.has(normalized)) {
      track = "managed";
    } else if (byo.has(normalized)) {
      track = "bring-your-own";
    }
  }

  const facts: Record<string, unknown> = {
    slug: normalized,
    rawInput: slug,
    track,
    snapshotDate,
    source,
    managedOAuthAvailable: track === "managed",
  };

  return {
    probe: "composioTrack",
    url: `https://docs.composio.dev/toolkits/${normalized}`,
    checkedAt,
    status: "ok",
    facts,
    evidence: "tested",
  };
}
