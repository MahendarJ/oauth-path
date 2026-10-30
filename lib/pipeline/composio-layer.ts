import { Claim, Guide } from "../schema";
import { ProbeObservation } from "../probes/types";
import { COMPOSIO_MANAGED_VS_CUSTOM_URL, ComposioToolkitPage } from "../probes/composio-docs";

/**
 * Deterministic post-audit layer. Facts that come from Composio's docs and from probes are
 * written in code, not left to the model, and every change is recorded in the audit log.
 */

interface ComposioDocsFacts {
  toolkit: ComposioToolkitPage;
  mcpToolkit: ComposioToolkitPage | null;
  managedVsCustom: { url: string; fetched: boolean; phrasesFound: Record<string, boolean> };
}

const normalizeText = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Merges claims with identical text and points every reference at the surviving id. */
export function dedupeClaims(guide: Guide): Guide {
  const keep = new Map<string, Claim>();
  const remap = new Map<string, string>();
  for (const claim of guide.claims) {
    const key = normalizeText(claim.text);
    const existing = keep.get(key);
    if (existing) {
      remap.set(claim.id, existing.id);
      const urls = new Set(existing.sources.map((s) => s.url));
      existing.sources.push(...claim.sources.filter((s) => !urls.has(s.url)));
    } else {
      keep.set(key, { ...claim, sources: [...claim.sources] });
    }
  }
  if (remap.size === 0) return guide;

  const fix = (ids: string[]) => [...new Set(ids.map((id) => remap.get(id) ?? id))];
  const fixText = (t: string) => t.replace(/\bc\d+\b/g, (id) => remap.get(id) ?? id);
  return {
    ...guide,
    claims: [...keep.values()],
    composio: { ...guide.composio, claimIds: fix(guide.composio.claimIds) },
    stages: guide.stages.map((s) => ({ ...s, steps: s.steps.map((st) => ({ ...st, claimIds: fix(st.claimIds) })) })),
    blockers: guide.blockers.map((b) => ({ ...b, claimIds: fix(b.claimIds) })),
    tested: guide.tested.map(fixText),
    auditLog: [
      ...guide.auditLog,
      ...[...remap].map(([from, to]) => ({
        was: `Claim ${from} repeated claim ${to}`,
        now: `Merged into ${to}`,
        change: "removed (duplicate, in code)",
      })),
    ],
  };
}

export function applyComposioLayer(guide: Guide, probes: ProbeObservation[], fetchedAt: string): Guide {
  const docs = probes.find((p) => p.probe === "composioDocs")?.facts as ComposioDocsFacts | undefined;
  const mcpProbe = probes.find((p) => p.probe === "mcpOauthMetadata");
  if (!docs) return guide;

  const claims: Claim[] = [];
  const auditLog = [...guide.auditLog];
  const phrase = docs.managedVsCustom.phrasesFound;
  const guidanceSource = { url: COMPOSIO_MANAGED_VS_CUSTOM_URL, fetchedAt };

  // A claim backed by an exact phrase in the managed-vs-custom page; unverified if the phrase is gone.
  const guidanceClaim = (id: string, text: string, phraseKeys: string[]): Claim => ({
    id,
    text,
    level: docs.managedVsCustom.fetched && phraseKeys.every((k) => phrase[k]) ? "doc-confirmed" : "unverified",
    sources: [{ ...guidanceSource, note: "Added in code from Composio's docs; exact wording checked on this run." }],
  });

  const { toolkit, mcpToolkit } = docs;
  if (toolkit.found) {
    claims.push({
      id: "k1",
      text: `Composio's ${toolkit.slug.toUpperCase()} toolkit lists auth ${toolkit.auth ?? "unknown"}; Composio-managed OAuth available: ${
        toolkit.managedOAuth === null ? "not stated" : toolkit.managedOAuth ? "yes" : "no"
      }.`,
      level: "doc-confirmed",
      sources: [{ url: toolkit.url, fetchedAt, note: "Toolkit page header, checked on this run." }],
    });
  }
  const managed = guide.track === "managed";
  // Claims about managed apps only belong in managed-track guides; k4 explains what your own app changes, so it applies to both.
  if (managed) {
    claims.push(
      guidanceClaim("k2", "With a Composio managed app you do not register your own OAuth app; Composio stores and refreshes the connected-account credentials.", ["noOwnApp", "storesAndRefreshes"]),
      guidanceClaim("k3", "Composio's current docs say managed apps can stay in production when their consent branding, scopes and shared provider quotas fit your product.", ["keepInProduction"])
    );
  }
  claims.push(
    guidanceClaim("k4", "Managed apps share provider quota across all Composio users and enforce a 2-minute minimum polling interval for triggers; your own app gets dedicated quota and faster polling where supported.", ["pollingMinimum", "sharedQuota"])
  );
  if (managed) {
    claims.push(guidanceClaim("k7", "With a managed app, users see Composio's app name on the provider's OAuth consent screen.", ["consentName"]));
  }
  if (mcpToolkit) {
    claims.push({
      id: "k5",
      text: `Composio also has a separate ${mcpToolkit.slug.toUpperCase()} toolkit (auth ${mcpToolkit.auth ?? "unknown"}; Composio-managed OAuth available: ${
        mcpToolkit.managedOAuth ? "yes" : "no"
      }). Its setup is separate from ${toolkit.slug.toUpperCase()}.`,
      level: "doc-confirmed",
      sources: [{ url: mcpToolkit.url, fetchedAt, note: "Toolkit page header, checked on this run." }],
    });
  }
  const mcpMeta = mcpProbe?.facts.metadata as { registration_endpoint?: string; issuer?: string } | null | undefined;
  if (mcpProbe && mcpMeta) {
    claims.push({
      id: "k6",
      text: mcpMeta.registration_endpoint
        ? `${new URL(mcpProbe.url).host} publishes OAuth server metadata with a dynamic client registration endpoint (${mcpMeta.registration_endpoint}), so an MCP client can register itself without a manually created app.`
        : `${new URL(mcpProbe.url).host} publishes OAuth server metadata but no dynamic client registration endpoint.`,
      level: "tested",
      sources: [{ url: mcpProbe.url, fetchedAt, note: `GET returned HTTP ${mcpProbe.status} with OAuth metadata on this run.` }],
    });
  }

  let next: Guide = {
    ...guide,
    claims: [...guide.claims.filter((c) => !/^k\d+$/.test(c.id)), ...claims],
    composio: { ...guide.composio, claimIds: claims.filter((c) => c.id === "k1" || c.id === "k2").map((c) => c.id) },
  };

  if (mcpToolkit) {
    next.requirements = [
      ...next.requirements,
      `If you want ${guide.app}'s MCP server rather than its API, that is a separate Composio toolkit (${mcpToolkit.slug.toUpperCase()}) with its own auth (k5).`,
    ];
  }

  // Older guidance vs current docs: flagged, not resolved.
  if (managed) {
    next.uncertain = [
      ...next.uncertain,
      "Older Composio guidance reportedly said to use managed apps in development and your own app in production; the current managed-vs-custom page says managed apps can stay in production (k3). The older page was not fetched here, so confirm with Composio for your case.",
    ];
  }

  // Source conflict: Composio lists OAuth for the toolkit, but the provider sources and probes found none.
  // Flagged as uncertain and as a blocker; the model's "no OAuth" conclusion is marked unconfirmed, not kept as fact.
  const metadataFound = probes.some((p) => p.probe === "oauthMetadata" && p.facts.discovered === true);
  const deniesOAuth = (t: string) =>
    /\b(no|not|without|cannot|isn't|doesn't)\b[^.]{0,40}\boauth|oauth[^.]{0,40}\bnot (possible|supported|available|exposed)/i.test(t);
  const verdictText = [guide.verdict.summary, guide.verdict.prototype.headline, guide.verdict.production.headline].join(" ");
  // Only on the bring-your-own track: a Composio-managed OAuth app already proves OAuth exists.
  if (!managed && toolkit.found && /oauth/i.test(toolkit.auth ?? "") && !metadataFound && deniesOAuth(verdictText)) {
    const conflict = `Sources conflict: Composio's ${toolkit.slug.toUpperCase()} toolkit lists ${toolkit.auth} (k1), but the provider pages fetched here describe no OAuth flow for the API and no OAuth metadata was found. This guide does not settle which is right.`;
    next.uncertain = [...next.uncertain, conflict];
    next.blockers = [
      ...next.blockers,
      {
        issue: `Unclear whether ${guide.app} offers OAuth for its API`,
        whenItHits: "Before you build: it decides whether you register an OAuth app or use an API key",
        whatToDo: `Check ${guide.app}'s developer documentation for OAuth app registration, and ask Composio which OAuth flow its ${toolkit.slug.toUpperCase()} toolkit uses. Until that is answered, an API key is the documented route.`,
        escalation: toolkit.url,
        claimIds: claims.some((c) => c.id === "k1") ? ["k1"] : [],
      },
    ];
    const unconfirmed = (h: string) => (h.startsWith("Unconfirmed:") ? h : `Unconfirmed: ${h}`);
    next.verdict = {
      ...next.verdict,
      prototype: { ...next.verdict.prototype, headline: unconfirmed(next.verdict.prototype.headline) },
      production: { ...next.verdict.production, headline: unconfirmed(next.verdict.production.headline) },
      confidence: `low: Composio lists OAuth for this toolkit but the provider sources found none (see blockers). Model's own assessment: ${next.verdict.confidence}`,
    };
    auditLog.push({ was: guide.verdict.confidence, now: next.verdict.confidence, change: "flagged (in code: source conflict)" });
  }

  if (managed) {
    const prototype = {
      difficulty: "Easy",
      handsOnTime: "15 min",
      waitTime: "none",
      headline: `No OAuth app needed to start: connect through Composio's managed ${guide.app} app.`,
    };
    const nextAction = `Prototype today with Composio's managed ${guide.app} app: create a session and send your user a Connect Link. Register your own ${guide.app} OAuth app only if you need your own name on the consent screen, custom scopes, dedicated quota or polling faster than 2 minutes.`;
    auditLog.push(
      { was: `Prototype: ${guide.verdict.prototype.headline}`, now: `Prototype: ${prototype.headline}`, change: "corrected (in code: managed track)" },
      { was: guide.nextAction, now: nextAction, change: "corrected (in code: managed track)" }
    );
    // A model-written "use Composio's managed app" stage repeats the code-written first stage.
    const repeatsManaged = (name: string) => /composio/i.test(name) && /managed/i.test(name);
    for (const stage of next.stages.filter((st) => repeatsManaged(st.name))) {
      auditLog.push({ was: `Stage "${stage.name}"`, now: `Merged into the first stage, "Connect through Composio's managed ${guide.app} app"`, change: "removed (duplicate, in code)" });
    }
    next.stages = next.stages.filter((st) => !repeatsManaged(st.name));
    next = {
      ...next,
      verdict: { ...next.verdict, prototype },
      nextAction,
      stages: [
        {
          id: "composio-managed",
          name: `Connect through Composio's managed ${guide.app} app`,
          owner: "agent",
          effort: "15 min",
          wait: null,
          steps: [
            { text: `Create a Composio session for your user. Do not pass an auth config for ${toolkit.slug}, so the managed app is used.`, claimIds: ["k2"].filter((id) => claims.some((c) => c.id === id)) },
            { text: `Send the user a Connect Link. They approve on ${guide.app}'s consent screen, which shows Composio's app name.`, claimIds: ["k7"] },
            { text: "Run one test tool call to confirm the connection works.", claimIds: [] },
          ],
        },
        ...next.stages,
      ],
    };
  }

  if (claims.some((c) => c.id === "k6")) next.tested = [...next.tested, `${claims.find((c) => c.id === "k6")!.text} (k6)`];
  next.auditLog = [
    ...auditLog,
    {
      was: "Composio and MCP facts as drafted by the model",
      now: `Claims ${claims.map((c) => c.id).join(", ")} added in code from Composio's docs and probes on this run`,
      change: "added (in code)",
    },
  ];
  return next;
}
