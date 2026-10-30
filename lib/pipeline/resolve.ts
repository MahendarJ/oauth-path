import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { ResolvedApp } from "./types";
import { extractJson } from "./json-utils";
import { normalizeSlug } from "../probes/composio-track";

export const ResolvedAppSchema = z.object({
  appName: z.string().min(1, "appName is required"),
  slug: z.string().min(1, "slug is required"),
  origin: z.string().url("origin must be a valid URL"),
  authDomain: z.string().url("authDomain must be a valid URL"),
  docsUrl: z.string().url("docsUrl must be a valid URL"),
  devConsoleUrl: z.string().url("devConsoleUrl must be a valid URL"),
});

function getKnownAppMetadata(slug: string): ResolvedApp | null {
  const norm = normalizeSlug(slug);
  if (norm === "linear") {
    return {
      appName: "Linear",
      slug: "linear",
      origin: "https://linear.app",
      authDomain: "https://linear.app",
      docsUrl: "https://developers.linear.app/docs/oauth/authentication",
      devConsoleUrl: "https://linear.app/settings/api/applications",
    };
  }
  if (norm === "clockify") {
    return {
      appName: "Clockify",
      slug: "clockify",
      origin: "https://clockify.me",
      authDomain: "https://app.clockify.me",
      docsUrl: "https://clockify.me/help/api",
      devConsoleUrl: "https://app.clockify.me/user/settings",
    };
  }
  if (norm === "spotify") {
    return {
      appName: "Spotify",
      slug: "spotify",
      origin: "https://accounts.spotify.com",
      authDomain: "https://accounts.spotify.com",
      docsUrl: "https://developer.spotify.com/documentation/web-api/concepts/authorization",
      devConsoleUrl: "https://developer.spotify.com/dashboard",
    };
  }
  return null;
}

export async function resolveApp(
  input: string,
  anthropicClient?: Anthropic
): Promise<ResolvedApp> {
  const slug = normalizeSlug(input);

  // If no API client or key, use built-in resolver
  if (!anthropicClient || !process.env.ANTHROPIC_API_KEY) {
    const known = getKnownAppMetadata(slug);
    if (known) return known;

    // Generic fallback for input
    const origin = input.startsWith("http") ? new URL(input).origin : `https://${slug}.com`;
    return {
      appName: slug.charAt(0).toUpperCase() + slug.slice(1),
      slug,
      origin,
      authDomain: origin,
      docsUrl: `${origin}/docs`,
      devConsoleUrl: `${origin}/developer`,
    };
  }

  // Read prompt template
  const promptTemplate = fs.readFileSync(
    path.join(process.cwd(), "prompts/resolve.md"),
    "utf-8"
  );
  const prompt = promptTemplate.replace("{{input}}", input);

  const model = process.env.MODEL || "claude-sonnet-5-5";

  // First attempt
  let response = await anthropicClient.messages.create({
    model,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  });

  const rawText = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");

  let parsed: unknown;
  try {
    parsed = extractJson(rawText);
    return ResolvedAppSchema.parse(parsed);
  } catch (err: unknown) {
    // Send error text back once for a repair attempt
    const errorText = err instanceof Error ? err.message : String(err);
    const repairPrompt = `Your previous output failed validation:
${errorText}

Please correct the JSON and return ONLY valid JSON matching:
{
  "appName": "string",
  "slug": "string",
  "origin": "https://...",
  "authDomain": "https://...",
  "docsUrl": "https://...",
  "devConsoleUrl": "https://..."
}`;

    const repairResponse = await anthropicClient.messages.create({
      model,
      max_tokens: 1024,
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
      return ResolvedAppSchema.parse(repairedJson);
    } catch (secondErr: unknown) {
      const secondMessage = secondErr instanceof Error ? secondErr.message : String(secondErr);
      throw new Error(`Resolve stage failed validation after repair attempt: ${secondMessage}`);
    }
  }
}
