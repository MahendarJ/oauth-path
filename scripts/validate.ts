import * as fs from "fs";
import * as path from "path";
import { GuideSchema } from "../lib/schema";

function validateFile(filePath: string): boolean {
  console.log(`\nValidating: ${filePath}`);
  if (!fs.existsSync(filePath)) {
    console.error(`Error: File not found at ${filePath}`);
    return false;
  }

  try {
    const rawContent = fs.readFileSync(filePath, "utf-8");
    const json = JSON.parse(rawContent);
    const result = GuideSchema.safeParse(json);

    if (result.success) {
      console.log(`✅ SUCCESS: ${json.app} (${json.slug}) conforms strictly to GuideSchema!`);
      console.log(`   - Track: ${result.data.track}`);
      console.log(`   - Composio Toolkit: ${result.data.composio.toolkitSlug} (Managed: ${result.data.composio.managedOAuthAvailable})`);
      console.log(`   - Prototype Verdict: [${result.data.verdict.prototype.difficulty}] ${result.data.verdict.prototype.headline}`);
      console.log(`     Effort: ${result.data.verdict.prototype.handsOnTime} | Wait: ${result.data.verdict.prototype.waitTime}`);
      console.log(`   - Production Verdict: [${result.data.verdict.production.difficulty}] ${result.data.verdict.production.headline}`);
      console.log(`     Effort: ${result.data.verdict.production.handsOnTime} | Wait: ${result.data.verdict.production.waitTime}`);
      console.log(`   - Confidence: ${result.data.verdict.confidence}`);
      console.log(`   - Summary: ${result.data.verdict.summary}`);
      console.log(`   - Stages: ${result.data.stages.length}`);
      console.log(`   - Claims: ${result.data.claims.length} (grounded and verified)`);
      console.log(`   - Blockers: ${result.data.blockers.length}`);
      console.log(`   - Agent vs You: Agent can do ${result.data.agentVsYou.agentCanDo.length} tasks, You must do ${result.data.agentVsYou.youMustDo.length} tasks`);
      console.log(`   - Uncertainties: ${result.data.uncertain.length}`);
      console.log(`   - Audit Log Entries: ${result.data.auditLog.length}`);
      return true;
    } else {
      console.error(`❌ VALIDATION FAILED for ${filePath}:`);
      console.error(JSON.stringify(result.error.format(), null, 2));
      return false;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ JSON PARSE ERROR in ${filePath}: ${message}`);
    return false;
  }
}

function main() {
  const targetArg = process.argv[2];
  const guidesDir = path.join(__dirname, "../guides");

  if (targetArg) {
    const targetPath = path.isAbsolute(targetArg)
      ? targetArg
      : path.join(process.cwd(), targetArg);
    const success = validateFile(targetPath);
    process.exit(success ? 0 : 1);
  }

  // Validate all json files in guides directory
  const files = fs.readdirSync(guidesDir).filter((f: string) => f.endsWith(".json"));
  if (files.length === 0) {
    console.warn("No guide JSON files found in guides directory.");
    process.exit(0);
  }

  let allValid = true;
  for (const file of files) {
    const filePath = path.join(guidesDir, file);
    const valid = validateFile(filePath);
    if (!valid) allValid = false;
  }

  if (allValid) {
    console.log(`\n🎉 All ${files.length} guide(s) passed schema validation successfully.`);
    process.exit(0);
  } else {
    console.error("\n❌ Some guides failed validation.");
    process.exit(1);
  }
}

main();
