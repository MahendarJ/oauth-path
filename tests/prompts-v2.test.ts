import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as path from "path";

/**
 * Validates that the first line of a prompt markdown string contains "(v2".
 */
export function validatePromptFirstLine(firstLine: string, filename: string): void {
  if (!firstLine.includes("(v2")) {
    throw new Error(
      `Prompt file "${filename}" first line does not contain "(v2": "${firstLine}"`
    );
  }
}

test("first line of every prompts/*.md must contain '(v2'", () => {
  const promptsDir = path.join(process.cwd(), "prompts");
  assert.ok(fs.existsSync(promptsDir), "prompts directory must exist");

  const files = fs.readdirSync(promptsDir).filter((f) => f.endsWith(".md"));
  assert.ok(files.length > 0, "prompts directory must contain markdown files");

  for (const file of files) {
    const filePath = path.join(promptsDir, file);
    const content = fs.readFileSync(filePath, "utf-8");
    const firstLine = content.split("\n")[0].trim();

    validatePromptFirstLine(firstLine, file);
  }
});

test("validatePromptFirstLine fails if first line does not contain '(v2'", () => {
  assert.throws(
    () => validatePromptFirstLine("# Resolve agent: system prompt (v1)", "resolve.md"),
    /does not contain "\(v2"/
  );

  assert.throws(
    () => validatePromptFirstLine("# Investigate agent: system prompt", "investigate.md"),
    /does not contain "\(v2"/
  );

  assert.doesNotThrow(() =>
    validatePromptFirstLine("# Resolve agent: system prompt (v2, no fetch tools)", "resolve.md")
  );
});
