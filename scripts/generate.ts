import * as fs from "fs";
import * as path from "path";
import { generateGuide, PipelineEvent } from "../lib/pipeline";

// Load .env if present
const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath) && typeof process.loadEnvFile === "function") {
  try {
    process.loadEnvFile(envPath);
  } catch {
    // ignore
  }
}

async function main() {
  const args = process.argv.slice(2);
  const target = args[0];

  if (!target) {
    console.error("Usage: npm run generate -- \"<app name or url>\"");
    console.error("Example: npm run generate -- \"linear\"");
    console.error("Example: npm run generate -- \"https://clockify.me\"");
    process.exit(1);
  }

  console.log(`\n🚀 Starting OAuth Path Guide Generation for: "${target}"`);

  function handleEvent(event: PipelineEvent) {
    const time = new Date().toLocaleTimeString();
    switch (event.type) {
      case "resolving":
        console.log(`[${time}] 🔍 [1/4 RESOLVE] Resolving application metadata for "${event.app}"...`);
        break;
      case "probing":
        console.log(`[${time}] 🌐 [2/4 PROBES] Running safe SSRF-guarded probes against "${event.target}"...`);
        break;
      case "investigating":
        console.log(
          `[${time}] 🔬 [3/4 INVESTIGATE] Synthesizing research and OAuth facts for "${event.app}" (Track: ${event.track})...`
        );
        break;
      case "auditing":
        console.log(
          `[${time}] ⚖️  [4/4 AUDIT] Auditing ${event.claimsCount} claims against probe observations and grounding rules...`
        );
        break;
      case "done":
        console.log(`\n✨ Guide generation complete for "${event.slug}"!`);
        console.log(`📄 Saved output to: ${event.path}`);
        console.log(`   - Prototype Verdict: [${event.guide.verdict.prototype.difficulty}] ${event.guide.verdict.prototype.headline}`);
        console.log(`   - Production Verdict: [${event.guide.verdict.production.difficulty}] ${event.guide.verdict.production.headline}`);
        console.log(`   - Stages: ${event.guide.stages.length}`);
        console.log(`   - Claims: ${event.guide.claims.length}`);
        console.log(`   - Audit Log Entries: ${event.guide.auditLog.length}`);
        break;
      case "error":
        console.error(`[${time}] ❌ ERROR: ${event.message}`);
        break;
    }
  }

  try {
    await generateGuide(target, { onEvent: handleEvent });
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\n💥 Pipeline execution failed: ${message}`);
    process.exit(1);
  }
}

main();
