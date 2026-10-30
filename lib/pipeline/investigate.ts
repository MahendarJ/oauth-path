import * as fs from "fs";
import * as path from "path";
import { Guide, GuideSchema } from "../schema";
import { ComposioTrack, ProbeObservation } from "../probes/types";
import { ResolvedApp } from "./resolve";
import { SourceSnapshot } from "./fetch-sources";
import { validateClaimSources } from "./validate-sources";
import { generateJson } from "./llm";
import { saveDebug } from "./debug";

const GUIDE_SCHEMA_SUMMARY = {
  type: "object",
  required: [
    "app",
    "slug",
    "generatedAt",
    "generatedBy",
    "track",
    "composio",
    "verdict",
    "stages",
    "requirements",
    "blockers",
    "agentVsYou",
    "claims",
    "uncertain",
    "tested",
    "notTested",
    "auditLog",
    "nextAction",
  ],
  properties: {
    app: "string",
    slug: "string (lowercase alphanumeric with hyphens)",
    generatedAt: "string (YYYY-MM-DD)",
    generatedBy: "string",
    track: "'managed' | 'bring-your-own'",
    composio: "{ toolkitSlug: string, managedOAuthAvailable: boolean, claimIds: string[] }",
    verdict: "{ prototype: { difficulty, handsOnTime, waitTime, headline }, production: { difficulty, handsOnTime, waitTime, headline }, confidence: string, summary: string }",
    stages: "array of { id, name, owner: 'developer' | 'agent' | 'provider', effort, wait: string | null, steps: array of { text, claimIds: string[] } }",
    requirements: "string[]",
    blockers: "array of { issue, whenItHits, whatToDo, escalation: string | null, claimIds: string[] }",
    agentVsYou: "{ agentCanDo: string[], youMustDo: string[] }",
    claims: "array of { id, text, level: 'tested' | 'doc-confirmed' | 'community-reported' | 'inferred' | 'unverified', sources: array of { url, fetchedAt: string | null, note?: string } }",
    uncertain: "string[]",
    tested: "string[]",
    notTested: "string[]",
    auditLog: "array of { was, now, change: string }",
    nextAction: "string",
  },
};

export async function investigateApp(
  resolved: ResolvedApp,
  snapshots: SourceSnapshot[],
  probes: ProbeObservation[],
  track: ComposioTrack
): Promise<Guide> {
  const system = fs.readFileSync(
    path.join(process.cwd(), "prompts/investigate.md"),
    "utf-8"
  );
  const gold = JSON.parse(
    fs.readFileSync(path.join(process.cwd(), "guides/_gold.json"), "utf-8")
  ) as Guide;
  // An excerpt keeps the example's structure, depth and honesty at about a quarter of the tokens,
  // so the request fits free-tier per-minute limits.
  const goldGuide = {
    note: "Excerpt of the Spotify gold guide: arrays are trimmed to their first entries.",
    ...gold,
    stages: gold.stages.slice(0, 2),
    blockers: gold.blockers.slice(0, 1),
    claims: gold.claims.slice(0, 4),
    uncertain: gold.uncertain.slice(0, 2),
    notTested: gold.notTested.slice(0, 2),
    auditLog: gold.auditLog.slice(0, 1),
  };

  const userPayload = JSON.stringify({
    resolved,
    sources: snapshots,
    probes,
    composioTrack: track,
    schema: GUIDE_SCHEMA_SUMMARY,
    goldGuide,
  });

  // Attempt 1: Call model without tools
  const firstResult = await generateJson<unknown>({
    system,
    user: userPayload,
  });

  try {
    const guide = GuideSchema.parse(firstResult);
    validateClaimSources(guide, snapshots, probes);
    return guide;
  } catch (err: unknown) {
    // Attempt 2 (Repair): Send validation error back once as a JSON user message
    const errorText = err instanceof Error ? err.message : String(err);
    saveDebug(resolved.slug, "investigate-attempt1", { error: errorText, output: firstResult });
    // The repair keeps the schema, the example and the failed draft so the model fixes it instead of starting over
    const repairUser = JSON.stringify({
      resolved,
      sources: snapshots,
      probes,
      composioTrack: track,
      schema: GUIDE_SCHEMA_SUMMARY,
      goldGuide,
      previousOutput: firstResult,
      error: errorText,
      repair: true,
    });

    const repairResult = await generateJson<unknown>({
      system,
      user: repairUser,
    });

    try {
      const repairedGuide = GuideSchema.parse(repairResult);
      validateClaimSources(repairedGuide, snapshots, probes);
      return repairedGuide;
    } catch (secondErr: unknown) {
      const secondMessage =
        secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(
        `Investigate stage failed validation after repair attempt: ${secondMessage}`
      );
    }
  }
}
