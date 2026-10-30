import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";

/**
 * Validates that a guide object contains a generation log with a model id.
 */
export function validateGuideHasGenerationLog(guide: Record<string, unknown>, filename: string): void {
  const genLog = guide.generationLog as { model?: unknown } | undefined;
  const modelId =
    typeof genLog?.model === "string" && genLog.model.trim().length > 0
      ? genLog.model.trim()
      : typeof guide.generatedBy === "string" && guide.generatedBy.trim().length > 0 && !guide.generatedBy.includes("hand-researched")
      ? guide.generatedBy.trim()
      : null;

  if (!modelId) {
    throw new Error(
      `Guide "${filename}" lacks a generation log with the model id (found generationLog: ${JSON.stringify(genLog)}, generatedBy: ${JSON.stringify(guide.generatedBy)})`
    );
  }
}

test("every guide in guides/ except _gold.json must possess a generation log with the model id", () => {
  const guidesDir = path.join(process.cwd(), "guides");
  if (!fs.existsSync(guidesDir)) return;

  const files = fs.readdirSync(guidesDir).filter((f) => f.endsWith(".json"));

  for (const file of files) {
    if (file === "_gold.json") continue; // Exclude gold standard reference

    const filePath = path.join(guidesDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;

    validateGuideHasGenerationLog(content, file);
  }
});

test("validateGuideHasGenerationLog correctly fails when generation log or model id is missing", () => {
  // Missing entirely
  assert.throws(
    () => validateGuideHasGenerationLog({ app: "Test" }, "test-missing.json"),
    /lacks a generation log with the model id/
  );

  // Hand-written attribution
  assert.throws(
    () =>
      validateGuideHasGenerationLog(
        { app: "Test", generatedBy: "hand-researched with web fetch" },
        "test-hand.json"
      ),
    /lacks a generation log with the model id/
  );

  // Empty model string
  assert.throws(
    () =>
      validateGuideHasGenerationLog(
        { app: "Test", generationLog: { model: "" } },
        "test-empty.json"
      ),
    /lacks a generation log with the model id/
  );

  // Valid model id in generationLog
  assert.doesNotThrow(() =>
    validateGuideHasGenerationLog(
      { app: "Test", generationLog: { model: "llama-3.3-70b-versatile" } },
      "test-valid.json"
    )
  );
});
