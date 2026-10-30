import * as fs from "fs";
import * as path from "path";
import { Guide } from "./schema";
import { loadAllGuides, loadGuide } from "./store";

export interface LibraryEntry {
  guide: Guide;
  handResearched: boolean;
}

/** Hand-researched references (like _gold.json) are labelled as such, never as model output. */
export function isHandResearched(guide: Guide): boolean {
  return guide.generatedBy.includes("hand-researched");
}

/** Every valid guide (bundled library plus runtime-generated), sorted by app name. */
export async function listGuides(): Promise<LibraryEntry[]> {
  return (await loadAllGuides())
    .map((guide) => ({ guide, handResearched: isHandResearched(guide) }))
    .sort((a, b) => a.guide.app.localeCompare(b.guide.app));
}

export async function getGuide(slug: string): Promise<LibraryEntry | null> {
  const guide = await loadGuide(slug);
  return guide ? { guide, handResearched: isHandResearched(guide) } : null;
}

/** Counts from Composio's managed-auth directory snapshot in data/. */
export function composioCounts(): { managed: number; byo: number } {
  const read = (f: string) => (JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", f), "utf-8")) as string[]).length;
  return { managed: read("managed-slugs.json"), byo: read("byo-slugs.json") };
}

export interface HumanCheck {
  slug: string;
  claimId: string;
  result: "confirmed" | "corrected" | "not-verified";
  note: string;
  evidence: string;
}

/** Hand checks of sampled claims against their sources (data/verification.json, summarised in VERIFICATION.md). */
export function humanChecks(slug: string): Map<string, HumanCheck> {
  const all = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "verification.json"), "utf-8")) as HumanCheck[];
  return new Map(all.filter((c) => c.slug === slug).map((c) => [c.claimId, c]));
}
