import * as fs from "fs";
import * as path from "path";
import { Guide, GuideSchema } from "../schema";
import { runAllProbes } from "../probes";
import { composioTrack } from "../probes/composio-track";
import { resolveApp } from "./resolve";
import { fetchSourceSnapshots } from "./fetch-sources";
import { investigateApp } from "./investigate";
import { auditGuide } from "./audit";
import { EventEmitter, PipelineEvent } from "./types";

export * from "./types";
export * from "./llm";
export * from "./resolve";
export * from "./fetch-sources";
export * from "./validate-sources";
export * from "./investigate";
export * from "./audit";
export * from "./json-utils";

export interface PipelineOptions {
  onEvent?: EventEmitter;
  fresh?: boolean; // if true, bypasses slug cache
  timeoutMs?: number; // total pipeline timeout (default: 300_000ms / 5 mins)
}

export async function generateGuide(
  input: string,
  options?: PipelineOptions
): Promise<Guide> {
  const onEvent = options?.onEvent || (() => {});
  const timeoutMs = options?.timeoutMs || 300_000;
  const guidesDir = path.join(process.cwd(), "guides");

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error(`Pipeline exceeded total timeout of ${timeoutMs}ms`)),
      timeoutMs
    )
  );

  const pipelinePromise = (async () => {
    // 1. Stage: Resolve
    onEvent({ type: "resolving", app: input });
    const resolved = await resolveApp(input);

    // Cache check by slug: return existing finished guide unless fresh=true
    const outputPath = path.join(guidesDir, `${resolved.slug}.json`);
    if (!options?.fresh && fs.existsSync(outputPath)) {
      try {
        const cachedRaw = JSON.parse(fs.readFileSync(outputPath, "utf-8"));
        const cachedGuide = GuideSchema.parse(cachedRaw);
        onEvent({
          type: "done",
          slug: cachedGuide.slug,
          path: outputPath,
          guide: cachedGuide,
        });
        return cachedGuide;
      } catch {
        // Cached file invalid, regenerate
      }
    }

    // 2. Stage: Fetch and Probe (in code, no model)
    onEvent({ type: "probing", target: resolved.origin });

    // Fetch up to 8 snapshots from official and community URLs
    const snapshots = await fetchSourceSnapshots(resolved);

    // Run probes and composioTrack
    const probeObservations = await runAllProbes(
      resolved.origin,
      resolved.slug,
      resolved.authorizationEndpoint
    );
    const composioObs = await composioTrack(resolved.slug);
    const track = composioObs.facts.track as "managed" | "bring-your-own" | "unknown";

    // 3. Stage: Investigate (model call, no tools)
    onEvent({ type: "investigating", app: resolved.appName, track });
    const draftGuide = await investigateApp(
      resolved,
      snapshots,
      probeObservations,
      track
    );

    // 4. Stage: Audit (model call, no tools)
    onEvent({ type: "auditing", claimsCount: draftGuide.claims.length });
    const finalGuide = await auditGuide(
      draftGuide,
      snapshots,
      probeObservations
    );

    // 5. Save guide to guides/<slug>.json
    if (!fs.existsSync(guidesDir)) {
      fs.mkdirSync(guidesDir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(finalGuide, null, 2), "utf-8");

    // 6. Stage: Done
    onEvent({
      type: "done",
      slug: finalGuide.slug,
      path: outputPath,
      guide: finalGuide,
    });

    return finalGuide;
  })();

  return Promise.race([pipelinePromise, timeoutPromise]);
}
