"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type StageKey = "resolving" | "probing" | "investigating" | "auditing";

const STAGES: { key: StageKey; title: string; what: string }[] = [
  { key: "resolving", title: "Resolve", what: "Search the web, pick the provider's official docs, fetch and verify every URL" },
  { key: "probing", title: "Probe", what: "Fetch sources and run live checks: OAuth discovery, authorize endpoint, DCR, Composio catalog" },
  { key: "investigating", title: "Investigate", what: "Draft the guide from fetched sources and probe results only" },
  { key: "auditing", title: "Audit", what: "Re-check every claim against the same sources and downgrade what is not supported" },
];

interface StreamEvent {
  type: StageKey | "done" | "error";
  at: number;
  app?: string;
  target?: string;
  track?: string;
  claimsCount?: number;
  slug?: string;
  message?: string;
}

function detail(e: StreamEvent): string | null {
  if (e.type === "probing") return `Target: ${e.target}`;
  if (e.type === "investigating") return `${e.app} · Composio track: ${e.track}`;
  if (e.type === "auditing") return `${e.claimsCount} claims to audit`;
  return null;
}

export function LiveGeneration({ q }: { q: string }) {
  const router = useRouter();
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  const done = events.find((e) => e.type === "done");
  const error = events.find((e) => e.type === "error");
  const finished = !!done || !!error;

  useEffect(() => {
    let source: EventSource | null = null;
    // Opened on the next tick so React's dev double-mount does not start two pipeline runs.
    const openTimer = setTimeout(() => {
      source = new EventSource(`/api/generate?q=${encodeURIComponent(q)}`);
      source.onmessage = (msg) => {
        const event = JSON.parse(msg.data) as StreamEvent;
        setEvents((prev) => [...prev, event]);
        if (event.type === "done" || event.type === "error") source?.close();
      };
      // EventSource reconnects on its own, which would start a second run: close instead.
      source.onerror = () => {
        source?.close();
        setEvents((prev) =>
          prev.some((e) => e.type === "done" || e.type === "error")
            ? prev
            : [...prev, { type: "error", at: Date.now(), message: "Lost the connection to the generation stream." }]
        );
      };
    }, 0);
    return () => {
      clearTimeout(openTimer);
      source?.close();
    };
  }, [q]);

  useEffect(() => {
    if (finished) return;
    const id = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(id);
  }, [finished]);

  useEffect(() => {
    if (done?.slug) {
      const id = setTimeout(() => router.push(`/guides/${done.slug}`), 1200);
      return () => clearTimeout(id);
    }
  }, [done, router]);

  const reached = new Set(events.map((e) => e.type));
  const lastStage = [...STAGES].reverse().find((s) => reached.has(s.key))?.key;
  const elapsed = Math.round(((finished ? events[events.length - 1].at : now) - startedAt) / 1000);

  return (
    <section className="live">
      <h1>
        Investigating <span className="query">{q}</span>
      </h1>
      <p className="muted">
        {finished ? (error ? "Stopped" : "Finished") : "Working"} · {elapsed}s. Usually takes 2 to 3 minutes: the free-tier model allows a
        limited number of tokens per minute, so the agent may pause about a minute between steps. Every source is fetched now,
        not taken from a previous answer.
      </p>

      <ol className="timeline">
        {STAGES.map((stage) => {
          const event = events.find((e) => e.type === stage.key);
          const state = !event
            ? "pending"
            : error && stage.key === lastStage
            ? "failed"
            : stage.key === lastStage && !done
            ? "active"
            : "done";
          return (
            <li key={stage.key} className={`step step-${state}`}>
              <span className="step-dot" aria-hidden />
              <div>
                <div className="step-title">
                  {stage.title} <span className="step-state">{state === "active" ? "running" : state}</span>
                </div>
                <div className="muted small">{stage.what}</div>
                {event && detail(event) && <div className="step-detail">{detail(event)}</div>}
              </div>
            </li>
          );
        })}
      </ol>

      {done && (
        <div className="card ok">
          Guide ready. Opening <Link href={`/guides/${done.slug}`}>/guides/{done.slug}</Link>…
        </div>
      )}
      {error && (
        <div className="card error">
          <strong>The agent stopped.</strong>
          <pre>{error.message}</pre>
          <p className="small">
            Nothing was guessed to fill the gap. If the app was not found, try its developer docs URL instead.{" "}
            <Link href="/">Back to the library</Link>
          </p>
        </div>
      )}
    </section>
  );
}
