import { extractJson } from "./json-utils";

export interface GenerateJsonOptions {
  system?: string;
  user: string;
}

const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 120_000;
// Caps the reply (reasoning included). Some providers count the reserved reply length toward per-minute token limits.
const MAX_COMPLETION_TOKENS = Number(process.env.LLM_MAX_COMPLETION_TOKENS) || 10_000;

/**
 * Delays execution with jitter.
 */
function sleep(ms: number): Promise<void> {
  const jitter = Math.floor(Math.random() * 500);
  return new Promise((resolve) => setTimeout(resolve, ms + jitter));
}

/**
 * Reads a required environment variable.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing ${name} environment variable. Please set it in .env or your environment.`);
  }
  return value.trim();
}

/**
 * The model id from LLM_MODEL. Also recorded in each guide's generation log.
 */
export function currentModel(): string {
  return requireEnv("LLM_MODEL");
}

/**
 * Formats a provider error body as status and message, with the API key redacted.
 */
function describeProviderError(status: number, body: string, apiKey: string): string {
  let text: string;
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown; type?: unknown; code?: unknown } };
    const e = parsed.error ?? {};
    text = [`HTTP ${status} ${e.type ?? ""} ${e.code ?? ""}`.trim(), `message: ${e.message ?? body}`].join("\n");
  } catch {
    text = `HTTP ${status}\nmessage: ${body.slice(0, 2000)}`;
  }
  return text.split(apiKey).join("[REDACTED]");
}

/**
 * Generates structured JSON through any OpenAI-compatible chat completions API in JSON mode
 * (Cerebras, Groq, Gemini, Mistral, ...), chosen by LLM_BASE_URL, LLM_API_KEY and LLM_MODEL.
 * All model interactions in the pipeline route through this function.
 */
export async function generateJson<T = unknown>(options: GenerateJsonOptions): Promise<T> {
  const baseUrl = requireEnv("LLM_BASE_URL").replace(/\/+$/, "");
  const apiKey = requireEnv("LLM_API_KEY");
  const model = currentModel();

  const messages = [
    ...(options.system ? [{ role: "system", content: options.system }] : []),
    { role: "user", content: options.user },
  ];

  const approxInputTokens = Math.round(((options.system?.length ?? 0) + options.user.length) / 4);
  console.log(`[LLM] ${model}: ~${approxInputTokens} input tokens, reply capped at ${MAX_COMPLETION_TOKENS}`);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_completion_tokens: MAX_COMPLETION_TOKENS,
        }),
        signal: controller.signal,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error && err.name === "AbortError" ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : String(err);
      throw new Error(`LLM request failed (${model}): ${msg}`);
    } finally {
      clearTimeout(timeoutId);
    }

    const body = await res.text();
    if (res.ok) {
      const data = JSON.parse(body) as { choices?: { message?: { content?: string } }[] };
      const responseText = data.choices?.[0]?.message?.content ?? "";
      if (!responseText.trim()) {
        throw new Error("Model returned empty text response");
      }
      return extractJson<T>(responseText);
    }

    const providerError = describeProviderError(res.status, body, apiKey);
    console.error(`[LLM error] ${model} (attempt ${attempt}/${MAX_RETRIES}):\n${providerError}`);

    // Only 429 is worth retrying; honour retry-after (seconds) when the provider sends it
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.pow(2, attempt) * 1500;
      console.warn(`[LLM 429] Rate limit hit on ${model}. Retrying in ${Math.round(delayMs / 1000)}s (attempt ${attempt}/${MAX_RETRIES})...`);
      await sleep(delayMs);
      continue;
    }

    throw new Error(`LLM request failed.\nProvider error:\n${providerError}`);
  }

  throw new Error(`Rate limit exceeded after ${MAX_RETRIES} attempts on ${model}.`);
}
