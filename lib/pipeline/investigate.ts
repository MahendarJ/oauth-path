import * as fs from "fs";
import * as path from "path";
import Anthropic from "@anthropic-ai/sdk";
import { Guide, GuideSchema } from "../schema";
import { ComposioTrack, ProbeObservation } from "../probes/types";
import { ResolvedApp } from "./types";
import { extractJson } from "./json-utils";
import { synthesizeLinearDraft } from "./synthesizers/linear";
import { synthesizeClockifyDraft } from "./synthesizers/clockify";

export async function investigateApp(
  resolved: ResolvedApp,
  probes: ProbeObservation[],
  track: ComposioTrack,
  anthropicClient?: Anthropic
): Promise<Guide> {
  // If no Anthropic key or client, use domain synthesizers
  if (!anthropicClient || !process.env.ANTHROPIC_API_KEY) {
    if (resolved.slug === "linear") {
      return synthesizeLinearDraft(probes);
    }
    if (resolved.slug === "clockify") {
      return synthesizeClockifyDraft(probes);
    }

    // Generic fallback synthesizer for unknown app
    const today = new Date().toISOString().split("T")[0];
    const genericDraft: Guide = {
      app: resolved.appName,
      slug: resolved.slug,
      generatedAt: today,
      generatedBy: "OAuth Path Pipeline (Fallback Synthesizer)",
      track: track === "managed" ? "managed" : "bring-your-own",
      composio: {
        toolkitSlug: resolved.slug,
        managedOAuthAvailable: track === "managed",
        claimIds: ["c1"],
      },
      verdict: {
        prototype: {
          difficulty: "Moderate",
          handsOnTime: "20 min",
          waitTime: "none",
          headline: `Initial integration testing for ${resolved.appName}.`,
        },
        production: {
          difficulty: "Gated",
          handsOnTime: "Unknown",
          waitTime: "unknown",
          headline: `Production deployment requires verification and developer portal configuration.`,
        },
        confidence: "medium on endpoints and setup",
        summary: `${resolved.appName} integration requires registering custom OAuth credentials.`,
      },
      stages: [
        {
          id: "s1",
          name: "Register Developer Account",
          owner: "developer",
          effort: "10 min",
          wait: null,
          steps: [
            {
              text: `Sign in to ${resolved.appName} Developer Portal at ${resolved.devConsoleUrl}.`,
              claimIds: ["c1"],
            },
          ],
        },
      ],
      requirements: [`${resolved.appName} account with developer privileges`],
      blockers: [
        {
          issue: "Undocumented rate limits or scope restrictions",
          whenItHits: "During initial OAuth flow testing",
          whatToDo: "Check developer portal documentation",
          escalation: resolved.docsUrl,
          claimIds: ["c1"],
        },
      ],
      agentVsYou: {
        agentCanDo: ["Generate Composio Connect link", "Verify connection state"],
        youMustDo: ["Sign in to developer console", "Copy Client ID and Secret"],
      },
      claims: [
        {
          id: "c1",
          text: `${resolved.appName} documentation is located at ${resolved.docsUrl}.`,
          level: "doc-confirmed",
          sources: [{ url: resolved.docsUrl, fetchedAt: today }],
        },
      ],
      uncertain: ["Specific review timelines and approval requirements"],
      tested: [],
      notTested: ["End-to-end OAuth flow execution"],
      auditLog: [],
      nextAction: `Visit ${resolved.devConsoleUrl} to begin configuration.`,
    };
    return GuideSchema.parse(genericDraft);
  }

  // Anthropic API Investigation
  const promptTemplate = fs.readFileSync(
    path.join(process.cwd(), "prompts/investigate.md"),
    "utf-8"
  );
  const goldGuideJson = fs.readFileSync(
    path.join(process.cwd(), "guides/_gold.json"),
    "utf-8"
  );

  const prompt = promptTemplate
    .replace("{{resolvedJson}}", JSON.stringify(resolved, null, 2))
    .replace("{{track}}", track)
    .replace("{{probeObservations}}", JSON.stringify(probes, null, 2))
    .replace("{{schemaDescription}}", "Matches GuideSchema exported in lib/schema.ts")
    .replace("{{goldGuideJson}}", goldGuideJson);

  const model = process.env.MODEL || "claude-sonnet-5-5";

  const tools: Anthropic.Messages.Tool[] = [
    {
      type: "web_search_20250305",
      name: "web_search",
    } as unknown as Anthropic.Messages.Tool,
    {
      type: "web_fetch_20250910",
      name: "web_fetch",
    } as unknown as Anthropic.Messages.Tool,
  ];

  let messages: Anthropic.Messages.MessageParam[] = [
    { role: "user", content: prompt },
  ];

  // Tool use loop with safety caps (max 10 tool iterations)
  const maxIterations = 10;
  let rawOutput = "";

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const response = await anthropicClient.messages.create(
      {
        model,
        max_tokens: 4096,
        messages,
        tools,
      },
      {
        headers: {
          "anthropic-beta": "web-fetch-2025-09-10",
        },
      }
    );

    // Check if model emitted text
    const textBlocks = response.content.filter((b) => b.type === "text");
    if (textBlocks.length > 0) {
      rawOutput = textBlocks.map((b) => b.text).join("\n");
    }

    // If stop reason is end_turn, break
    if (response.stop_reason === "end_turn" || response.stop_reason === "stop_sequence") {
      break;
    }

    // If stop reason is tool_use, handle tool results
    if (response.stop_reason === "tool_use") {
      // In server-side tools (web_search / web_fetch), Anthropic server executes them
      // and response content may already contain results, or we pass back empty tool responses if custom.
      // Append assistant message
      messages.push({ role: "assistant", content: response.content });
      break;
    }
  }

  // Validate with GuideSchema
  try {
    const json = extractJson(rawOutput);
    return GuideSchema.parse(json);
  } catch (err: unknown) {
    const errorText = err instanceof Error ? err.message : String(err);
    // Send error text back once for a repair attempt
    const repairPrompt = `Your generated guide JSON failed schema validation:
${errorText}

Please correct the guide and return ONLY the valid JSON object conforming strictly to GuideSchema.`;

    const repairResponse = await anthropicClient.messages.create({
      model,
      max_tokens: 4096,
      messages: [
        ...messages,
        { role: "assistant", content: rawOutput },
        { role: "user", content: repairPrompt },
      ],
    });

    const repairRawText = repairResponse.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    try {
      const repairedJson = extractJson(repairRawText);
      return GuideSchema.parse(repairedJson);
    } catch (secondErr: unknown) {
      const secondMessage = secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(`Investigate stage failed validation after repair attempt: ${secondMessage}`);
    }
  }
}
