import { runAllProbes } from "../lib/probes";

async function main() {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith("--"));
  const slugArgIndex = args.indexOf("--slug");
  const explicitSlug = slugArgIndex !== -1 ? args[slugArgIndex + 1] : undefined;

  if (!target) {
    console.error("Usage: npm run probe -- <origin> [--slug <slug>]");
    console.error("Example: npm run probe -- https://accounts.spotify.com");
    process.exit(1);
  }

  try {
    const observations = await runAllProbes(target, explicitSlug);
    console.log(JSON.stringify(observations, null, 2));
    process.exit(0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify(
        {
          error: "Probe execution failed",
          target,
          message,
        },
        null,
        2
      )
    );
    process.exit(1);
  }
}

main();
