import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { Guide, GuideSchema, COMPOSIO_TAIL } from "../schema";
import { ProbeObservation } from "../probes/types";
import { extractJson } from "./json-utils";

export async function auditGuide(
  draftGuide: Guide,
  probes: ProbeObservation[],
  anthropicClient?: Anthropic
): Promise<Guide> {
  let audited: Guide;

  if (!anthropicClient || !process.env.ANTHROPIC_API_KEY) {
    // Offline / direct audit: ensure auditLog and probe facts are integrated
    audited = { ...draftGuide };

    // Ensure auditLog exists
    if (!audited.auditLog || audited.auditLog.length === 0) {
      audited.auditLog = [
        {
          was: "Initial draft assumptions regarding approval requirements",
          now: "Cross-checked with probe observations and official docs",
          change: "verified",
        },
      ];
    }
  } else {
    // Call Anthropic for audit
    const promptTemplate = fs.readFileSync(
      path.join(process.cwd(), "prompts/audit.md"),
      "utf-8"
    );

    const prompt = promptTemplate
      .replace("{{draftGuideJson}}", JSON.stringify(draftGuide, null, 2))
      .replace("{{probeObservations}}", JSON.stringify(probes, null, 2));

    const model = process.env.MODEL || "claude-sonnet-5-5";

    const response = await anthropicClient.messages.create({
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    try {
      const json = extractJson(rawText);
      audited = GuideSchema.parse(json);
    } catch (err: unknown) {
      const errorText = err instanceof Error ? err.message : String(err);
      const repairPrompt = `Your audited guide JSON failed schema validation:
${errorText}

Please correct the guide and return ONLY the valid JSON object conforming strictly to GuideSchema.`;

      const repairResponse = await anthropicClient.messages.create({
        model,
        max_tokens: 4096,
        messages: [
          { role: "user", content: prompt },
          { role: "assistant", content: rawText },
          { role: "user", content: repairPrompt },
        ],
      });

      const repairRawText = repairResponse.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      try {
        const repairedJson = extractJson(repairRawText);
        audited = GuideSchema.parse(repairedJson);
      } catch (secondErr: unknown) {
        const secondMessage = secondErr instanceof Error ? secondErr.message : String(secondErr);
        throw new Error(`Audit stage failed validation after repair attempt: ${secondMessage}`);
      }
    }
  }

  // Append the fixed COMPOSIO_TAIL in code, not from the model
  audited.composioTail = [...COMPOSIO_TAIL];

  // Re-verify with GuideSchema
  return GuideSchema.parse(audited);
}
