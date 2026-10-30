/**
 * Extracts and parses JSON from a model response string, safely handling surrounding prose,
 * conversational text, and markdown fences.
 */
export function extractJson<T = unknown>(rawText: string): T {
  const trimmed = rawText.trim();

  // 1. Try direct parsing first
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    // Continue to regex / substring extraction
  }

  // 2. Check for markdown code fences (```json ... ``` or ``` ...)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim()) as T;
    } catch {
      // Continue to balance-bracket extraction
    }
  }

  // 3. Find outermost JSON object { ... }
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate) as T;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse extracted JSON object: ${message}`);
    }
  }

  throw new Error("No valid JSON object found in model output");
}
