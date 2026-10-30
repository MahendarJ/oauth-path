import * as fs from "fs";
import * as path from "path";

/**
 * Prints the sentences around each pattern in a guide's fetched source snapshots, for checking claims by hand.
 * Usage: npm run evidence -- <slug> "<regex>" ["<regex>" ...]
 */
const [slug, ...patterns] = process.argv.slice(2);
if (!slug || patterns.length === 0) {
  console.error('Usage: npm run evidence -- <slug> "<regex>" ["<regex>" ...]');
  process.exit(1);
}

const file = path.join(process.cwd(), ".cache/sources", slug, "snapshots.json");
if (!fs.existsSync(file)) {
  console.error(`No snapshots for "${slug}". Generate the guide first: npm run generate -- "${slug}" --fresh`);
  process.exit(1);
}
const snapshots = JSON.parse(fs.readFileSync(file, "utf-8")) as { url: string; fetchedAt: string; text: string }[];

for (const pattern of patterns) {
  const re = new RegExp(pattern, "i");
  let hits = 0;
  for (const s of snapshots) {
    const text = s.text.replace(/\s+/g, " ");
    const m = text.match(re);
    if (!m || m.index === undefined) continue;
    hits++;
    console.log(`/${pattern}/ @ ${s.url} (fetched ${s.fetchedAt}):\n  ...${text.slice(Math.max(0, m.index - 160), m.index + 220)}...\n`);
  }
  if (!hits) console.log(`/${pattern}/: not found in ${snapshots.length} snapshot(s)\n`);
}
