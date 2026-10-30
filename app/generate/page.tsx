import Link from "next/link";
import { LiveGeneration } from "./LiveGeneration";

export default async function GeneratePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  return (
    <>
      <nav className="crumbs">
        <Link href="/">Library</Link> / Generate
      </nav>
      {q?.trim() ? <LiveGeneration q={q.trim()} /> : <p className="muted">Type an app name or URL on the library page.</p>}
    </>
  );
}
