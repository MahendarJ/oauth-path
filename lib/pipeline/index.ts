import { Guide, GuideSchema } from "../schema";
import { runAllProbes } from "../probes";
import { composioTrack } from "../probes/composio-track";
import { resolveApp } from "./resolve";
import { fetchSourceSnapshots } from "./fetch-sources";
import { investigateApp } from "./investigate";
import { auditGuide } from "./audit";
import { applyComposioLayer, dedupeClaims } from "./composio-layer";
import { EventEmitter, PipelineEvent } from "./types";
import { loadGuide, saveGuide } from "../store";

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
    const cachedGuide = options?.fresh ? null : await loadGuide(resolved.slug);
    if (cachedGuide) {
      onEvent({ type: "done", slug: cachedGuide.slug, path: "(cached)", guide: cachedGuide });
      return cachedGuide;
    }

    // 2. Stage: Fetch and Probe (in code, no model)
    onEvent({ type: "probing", target: resolved.origin });

    // Fetch up to 8 snapshots from official and community URLs
    const snapshots = await fetchSourceSnapshots(resolved);

    // Run probes and composioTrack
    const probeObservations = await runAllProbes(
      resolved.origin,
      resolved.composioSlugGuess,
      resolved.authorizationEndpoint
    );
    const composioObs = await composioTrack(resolved.composioSlugGuess);
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
    const auditedGuide = await auditGuide(
      draftGuide,
      snapshots,
      probeObservations
    );

    // Composio and probe facts are applied in code, then the result is re-validated
    const today = new Date().toISOString().split("T")[0];
    const finalGuide = GuideSchema.parse(
      applyComposioLayer(dedupeClaims(auditedGuide), probeObservations, today)
    );

    // 5. Save guide (guides/ locally, Vercel Blob when deployed)
    const outputPath = await saveGuide(finalGuide);

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
