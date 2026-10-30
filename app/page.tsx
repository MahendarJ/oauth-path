import Link from "next/link";
import { composioCounts, listGuides } from "@/lib/guides";
import { DifficultyBadge, TrackBadge } from "./components/badges";
import { SearchBox } from "./components/SearchBox";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const entries = await listGuides();
  const counts = composioCounts();

  return (
    <>
      <section className="hero">
        <h1>Do you need your own OAuth app, and how long until it is approved?</h1>
        <p className="lede">
          Look up an app to get a verdict for prototype and production, the steps in order, what an agent can do for you,
          and where you take over. Unknown apps are investigated live by an agent.
        </p>
        <SearchBox librarySlugs={entries.map((e) => e.guide.slug)} />
        <p className="muted small">
          Composio provides the OAuth app for {counts.managed} toolkits. For {counts.byo} others you register your own
          (snapshot 2026-10-30).
        </p>
      </section>

      <section>
        <h2 className="section-title">Library</h2>
        {entries.length === 0 ? (
          <p className="muted">No guides yet. Search for an app above to generate the first one.</p>
        ) : (
          <div className="grid">
            {entries.map(({ guide, handResearched }) => (
              <Link key={guide.slug} href={`/guides/${guide.slug}`} className="card card-link">
                <div className="card-head">
                  <h3>{guide.app}</h3>
                  {handResearched && <span className="badge ref">Reference</span>}
                </div>
                <TrackBadge track={guide.track} />
                <div className="tiers">
                  <div>
                    <span className="tier-label">Prototype</span> <DifficultyBadge difficulty={guide.verdict.prototype.difficulty} />
                  </div>
                  <div>
                    <span className="tier-label">Production</span> <DifficultyBadge difficulty={guide.verdict.production.difficulty} />
                  </div>
                </div>
                <p className="card-text">{guide.verdict.production.headline}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
