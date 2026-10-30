import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { Guide } from "../schema";
import { runAllProbes } from "../probes";
import { composioTrack } from "../probes/composio-track";
import { resolveApp } from "./resolve";
import { investigateApp } from "./investigate";
import { auditGuide } from "./audit";
import { EventEmitter, PipelineEvent } from "./types";

export * from "./types";
export * from "./resolve";
export * from "./investigate";
export * from "./audit";
export * from "./json-utils";

export interface PipelineOptions {
  onEvent?: EventEmitter;
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
    // 0. Initialize Anthropic client if key is present
    let anthropicClient: Anthropic | undefined;
    if (process.env.ANTHROPIC_API_KEY) {
      anthropicClient = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY,
      });
    }

    // 1. Stage: Resolve
    onEvent({ type: "resolving", app: input });
    const resolved = await resolveApp(input, anthropicClient);

    // 2. Stage: Probes + ComposioTrack
    onEvent({ type: "probing", target: resolved.origin });
    const probeObservations = await runAllProbes(resolved.origin, resolved.slug);
    const composioObs = await composioTrack(resolved.slug);
    const track = composioObs.facts.track as "managed" | "bring-your-own" | "unknown";

    // 3. Stage: Investigate
    onEvent({ type: "investigating", app: resolved.appName, track });
    const draftGuide = await investigateApp(
      resolved,
      probeObservations,
      track,
      anthropicClient
    );

    // 4. Stage: Audit
    onEvent({ type: "auditing", claimsCount: draftGuide.claims.length });
    const finalGuide = await auditGuide(draftGuide, probeObservations, anthropicClient);

    // 5. Save guide to guides/<slug>.json
    const guidesDir = path.join(process.cwd(), "guides");
    if (!fs.existsSync(guidesDir)) {
      fs.mkdirSync(guidesDir, { recursive: true });
    }
    const outputPath = path.join(guidesDir, `${finalGuide.slug}.json`);
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
