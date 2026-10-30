import * as fs from "fs";
import * as path from "path";
import { Guide, GuideSchema, COMPOSIO_TAIL } from "../schema";
import { ProbeObservation } from "../probes/types";
import { SourceSnapshot } from "./fetch-sources";
import { validateClaimSources } from "./validate-sources";
import { currentModel, generateJson } from "./llm";
import { saveDebug } from "./debug";

/**
 * prompts/audit.md replies with { guide, auditLog, auditSummary }. The prompt requires
 * guide.auditLog to equal the top-level auditLog, so the top-level one is applied here.
 */
function parseAuditOutput(output: unknown): Guide {
  const wrapper = (output ?? {}) as { guide?: unknown; auditLog?: unknown };
  const guide = { ...((wrapper.guide ?? {}) as Record<string, unknown>) };
  if (Array.isArray(wrapper.auditLog)) guide.auditLog = wrapper.auditLog;
  return GuideSchema.parse(guide);
}

export async function auditGuide(
  draftGuide: Guide,
  snapshots: SourceSnapshot[],
  probes: ProbeObservation[]
): Promise<Guide> {
  const system = fs.readFileSync(
    path.join(process.cwd(), "prompts/audit.md"),
    "utf-8"
  );

  const userPayload = JSON.stringify({
    draft: draftGuide,
    sources: snapshots,
    probes,
  });

  let audited: Guide;

  // Attempt 1: Call model without tools
  const firstResult = await generateJson<unknown>({
    system,
    user: userPayload,
  });

  try {
    audited = parseAuditOutput(firstResult);
    validateClaimSources(audited, snapshots, probes);
  } catch (err: unknown) {
    // Attempt 2 (Repair): Send validation error back once as a JSON user message
    const errorText = err instanceof Error ? err.message : String(err);
    saveDebug(draftGuide.slug, "audit-attempt1", { error: errorText, output: firstResult });
    const repairUser = JSON.stringify({
      draft: draftGuide,
      sources: snapshots,
      probes,
      previousOutput: firstResult,
      error: errorText,
      repair: true,
    });

    const repairResult = await generateJson<unknown>({
      system,
      user: repairUser,
    });

    try {
      audited = parseAuditOutput(repairResult);
      validateClaimSources(audited, snapshots, probes);
    } catch (secondErr: unknown) {
      const secondMessage =
        secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(
        `Audit stage failed validation after repair attempt: ${secondMessage}`
      );
    }
  }

  // Append the fixed COMPOSIO_TAIL in code, not from the model
  audited.composioTail = [...COMPOSIO_TAIL];

  // Record generationLog with the model ID
  const model = currentModel();
  audited.generatedBy = model;
  audited.generationLog = {
    model,
    generatedAt: new Date().toISOString(),
  };

  // Re-verify and return
  return GuideSchema.parse(audited);
}
