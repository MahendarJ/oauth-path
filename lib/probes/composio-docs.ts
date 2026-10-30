import { safeFetch } from "./ssrf";
import { ProbeObservation } from "./types";

export const COMPOSIO_MANAGED_VS_CUSTOM_URL =
  "https://docs.composio.dev/docs/authentication/custom-app-vs-managed-app";
const toolkitPageUrl = (slug: string) => `https://docs.composio.dev/toolkits/${slug}`;

/**
 * Exact phrases the code-added Composio claims rely on. Each is checked against the
 * fetched page on every run; a claim whose phrase is missing is downgraded to unverified.
 */
export const COMPOSIO_PHRASES = {
  noOwnApp: "You do not need to register your own OAuth app",
  storesAndRefreshes: "Both options use Composio to store and refresh connected-account credentials",
  keepInProduction: "Keep them in production when their consent branding, scopes, and shared provider quotas fit your product",
  pollingMinimum: "Managed auth enforces a 2-minute minimum polling interval",
  sharedQuota: "Managed apps share quota across all Composio users",
  consentName: "Users see Composio's app name during OAuth",
} as const;

export interface ComposioToolkitPage {
  slug: string;
  url: string;
  found: boolean;
  auth: string | null;
  managedOAuth: boolean | null;
}

/** Reads the header of a Composio toolkit page (the .md variant): "Auth:" and "Composio-managed OAuth available?". */
async function readToolkitPage(slug: string): Promise<ComposioToolkitPage> {
  const url = toolkitPageUrl(slug);
  try {
    const res = await safeFetch(`${url}.md`, { headers: { Accept: "text/markdown,text/plain,*/*" } });
    if (res.status !== 200) return { slug, url, found: false, auth: null, managedOAuth: null };
    const auth = res.data.match(/\*\*Auth:\*\*\s*([^\n]+)/)?.[1]?.trim() ?? null;
    const managed = res.data.match(/\*\*Composio-managed OAuth available\?\*\*\s*(Yes|No)/i)?.[1];
    return { slug, url, found: true, auth, managedOAuth: managed ? managed.toLowerCase() === "yes" : null };
  } catch {
    return { slug, url, found: false, auth: null, managedOAuth: null };
  }
}

/**
 * Live check of Composio's docs: the toolkit page, its _mcp sibling, and the managed-vs-custom page.
 */
export async function composioDocs(slug: string): Promise<ProbeObservation> {
  const base = slug.toLowerCase().replace(/_mcp$/, "");
  const [toolkit, mcpToolkit, guidance] = await Promise.all([
    readToolkitPage(base),
    readToolkitPage(`${base}_mcp`),
    safeFetch(`${COMPOSIO_MANAGED_VS_CUSTOM_URL}.md`).catch(() => null),
  ]);

  const guidanceText = guidance?.status === 200 ? guidance.data : "";
  const phrasesFound = Object.fromEntries(
    Object.entries(COMPOSIO_PHRASES).map(([key, phrase]) => [key, guidanceText.includes(phrase)])
  ) as Record<keyof typeof COMPOSIO_PHRASES, boolean>;

  return {
    probe: "composioDocs",
    url: toolkit.url,
    checkedAt: new Date().toISOString(),
    status: toolkit.found ? 200 : "not-found",
    facts: {
      toolkit,
      mcpToolkit: mcpToolkit.found ? mcpToolkit : null,
      managedVsCustom: { url: COMPOSIO_MANAGED_VS_CUSTOM_URL, fetched: guidanceText.length > 0, phrasesFound },
    },
    evidence: "doc-confirmed",
  };
}
