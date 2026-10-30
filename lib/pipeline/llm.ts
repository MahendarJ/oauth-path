import { GoogleGenAI } from "@google/genai";
import { extractJson } from "./json-utils";

export interface GenerateJsonOptions {
  system?: string;
  user: string;
  grounded?: boolean;
}

const DEFAULT_MODEL = "gemini-2.5-flash";
const MAX_RETRIES = 3;

/**
 * Delays execution with jitter.
 */
function sleep(ms: number): Promise<void> {
  const jitter = Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

/**
 * Checks whether an error is rate-limiting (429 or RESOURCE_EXHAUSTED).
 */
function isRateLimitError(err: unknown): boolean {
  if (!err) return false;
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.toLowerCase().includes("rate limit") ||
    msg.toLowerCase().includes("quota exceeded")
  );
}

/**
 * Generates structured JSON using Google Gemini API.
 * All model interactions in the pipeline route through this function.
 */
export async function generateJson<T = unknown>(options: GenerateJsonOptions): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey.trim().length === 0) {
    throw new Error(
      "Missing GEMINI_API_KEY environment variable. Please set it in .env or your environment."
    );
  }

  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  const ai = new GoogleGenAI({ apiKey });

  const config: Record<string, unknown> = {
    responseMimeType: "application/json",
  };

  if (options.system) {
    config.systemInstruction = options.system;
  }

  if (options.grounded) {
    config.tools = [{ googleSearch: {} }];
  }

  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: options.user,
        config: config as never,
      });

      const responseText = response.text || "";
      if (!responseText.trim()) {
        throw new Error("Model returned empty text response");
      }

      return extractJson<T>(responseText);
    } catch (err: unknown) {
      lastError = err;

      // Handle Google Search grounding unavailability specifically
      if (options.grounded) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        if (
          errorMsg.toLowerCase().includes("grounding") ||
          errorMsg.toLowerCase().includes("search") ||
          errorMsg.toLowerCase().includes("tool")
        ) {
          throw new Error(
            "Google Search grounding is unavailable or failed for this query. Please provide the direct developer documentation URL for this application."
          );
        }
      }

      // Handle 429 / Rate limiting with exponential backoff
      if (isRateLimitError(err)) {
        if (attempt < MAX_RETRIES) {
          const delayMs = Math.pow(2, attempt) * 1500; // 3s, 6s, 12s
          console.warn(
            `[Gemini 429] Rate limit hit on ${model}. Retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/${MAX_RETRIES})...`
          );
          await sleep(delayMs);
          continue;
        } else {
          throw new Error(
            "Rate limit exceeded (429 / RESOURCE_EXHAUSTED). The Gemini API free tier rate limit was reached. Please wait a moment before trying again."
          );
        }
      }

      // For non-retryable errors, rethrow immediately
      throw err;
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
