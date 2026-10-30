import { Guide } from "../schema";
import { ProbeObservation } from "../probes/types";
import { SourceSnapshot } from "./fetch-sources";

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url.replace(/\/+$/, "");
  }
}

/**
 * Validates that every claim source URL in the guide originated from the fetched snapshots or probes.
 * Throws an Error listing unverified URLs if any are found.
 */
export function validateClaimSources(
  guide: Guide,
  snapshots: SourceSnapshot[],
  probes: ProbeObservation[]
): void {
  const allowedUrls = new Set<string>();

  // Add all snapshot URLs
  for (const snap of snapshots) {
    allowedUrls.add(normalizeUrl(snap.url));
  }

  // Add all probe URLs
  for (const probe of probes) {
    if (probe.url) allowedUrls.add(normalizeUrl(probe.url));
    const facts = probe.facts || {};
    if (typeof facts.sourceEndpoint === "string") {
      allowedUrls.add(normalizeUrl(facts.sourceEndpoint));
    }
    if (Array.isArray(facts.endpointsChecked)) {
      for (const ep of facts.endpointsChecked) {
        if (typeof ep === "string") allowedUrls.add(normalizeUrl(ep));
      }
    }
    if (typeof facts.registrationEndpoint === "string") {
      allowedUrls.add(normalizeUrl(facts.registrationEndpoint));
    }
    if (typeof facts.source === "string" && facts.source.startsWith("http")) {
      allowedUrls.add(normalizeUrl(facts.source));
    }
    // composioDocs: toolkit pages and the managed-vs-custom page it fetched
    for (const key of ["toolkit", "mcpToolkit", "managedVsCustom"]) {
      const nested = facts[key] as { url?: unknown; found?: unknown; fetched?: unknown } | null | undefined;
      if (nested && typeof nested.url === "string" && (nested.found === true || nested.fetched === true)) {
        allowedUrls.add(normalizeUrl(nested.url));
      }
    }
  }

  // Always allow canonical Composio managed auth doc URL
  allowedUrls.add("https://docs.composio.dev/toolkits/managed-auth");

  const unverified: { claimId: string; url: string }[] = [];

  for (const claim of guide.claims) {
    for (const source of claim.sources || []) {
      if (source.url) {
        const norm = normalizeUrl(source.url);
        if (!allowedUrls.has(norm)) {
          unverified.push({ claimId: claim.id, url: source.url });
        }
      }
    }
  }

  if (unverified.length > 0) {
    const details = unverified
      .map((u) => `Claim "${u.claimId}" cites disallowed source URL: "${u.url}"`)
      .join("; ");
    throw new Error(
      `Source URL verification failed: ${details}. Every claim source URL must come from the snapshots or probes.`
    );
  }
}
