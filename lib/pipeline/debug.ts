import * as fs from "fs";
import * as path from "path";
import { writableDir } from "../store";

/**
 * Writes a failed model attempt to <writable dir>/debug/<slug>-<stage>.json (gitignored .cache locally) for inspection.
 */
export function saveDebug(slug: string, stage: string, data: unknown): void {
  try {
    const dir = writableDir("debug");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${slug}-${stage}.json`), JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // debugging aid only
  }
}
