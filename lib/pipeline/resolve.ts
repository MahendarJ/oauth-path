import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { generateJson } from "./llm";

export const ResolvedAppSchema = z.object({
  appName: z.string().min(1, "appName is required"),
  slug: z.string().min(1, "slug is required"),
  origin: z.string().url("origin must be a valid URL"),
  authDomain: z.string().url("authDomain must be a valid URL").optional(),
  authorizationEndpoint: z.string().url("authorizationEndpoint must be a valid URL").optional(),
  tokenEndpoint: z.string().url("tokenEndpoint must be a valid URL").optional(),
  officialUrls: z.array(z.string().url()).min(1, "At least one official URL is required"),
  communityUrls: z.array(z.string().url()).default([]),
});
export type ResolvedApp = z.infer<typeof ResolvedAppSchema>;

export async function resolveApp(input: string): Promise<ResolvedApp> {
  const system = fs.readFileSync(
    path.join(process.cwd(), "prompts/resolve.md"),
    "utf-8"
  );
  const user = JSON.stringify({ query: input });

  // Attempt 1: Call model with Google Search grounding
  const firstResult = await generateJson<unknown>({
    system,
    user,
    grounded: true,
  });

  const parsed = ResolvedAppSchema.safeParse(firstResult);
  if (parsed.success) {
    return parsed.data;
  }

  // Attempt 2 (Repair): Send validation error back once as a JSON user message
  const errorText = JSON.stringify(parsed.error.format());
  const repairUser = JSON.stringify({
    query: input,
    error: errorText,
    repair: true,
  });

  const repairResult = await generateJson<unknown>({
    system,
    user: repairUser,
    grounded: false,
  });

  const repairedParsed = ResolvedAppSchema.safeParse(repairResult);
  if (repairedParsed.success) {
    return repairedParsed.data;
  }

  throw new Error(
    `Resolve stage failed validation after repair retry: ${JSON.stringify(repairedParsed.error.format())}`
  );
}
