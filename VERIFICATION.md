# Verification

A sample of generated claims, checked by hand against the source pages the pipeline fetched (`.cache/sources/<slug>/snapshots.json`) and, for probe results and Spotify, against the live URLs. Checked on 2026-10-30.

**Result:** 25 claims checked across 6 guides.

| Result | Count |
|---|---|
| Confirmed | 18 |
| Corrected (wrong or misleading) | 4 |
| Could not verify from the fetched text | 3 |

Each result is also shown on the guide page, in the evidence table's **Human check** column (`data/verification.json`). The guide files themselves are left as the model wrote them; corrections sit next to them rather than being edited in silently.

## Method

1. For each sampled claim, search the fetched page text for the specific statement (`npm run evidence -- <slug> "<pattern>"`) and read the surrounding sentence.
2. Re-run each probe claim by hand with `curl` against the same URL.
3. Count a claim as **confirmed** only when the source says it, not when it is merely plausible.

I chose claims that a developer would act on: token lifetimes, rate limits, redirect URI rules, who can create the app, review and certification, and anything that looked surprising.

## Corrections

| Guide | Claim | What the guide says | What the source says |
|---|---|---|---|
| Notion | c3 | Redirect URIs cannot be changed after creation. | "This can't be changed after creation" refers to the **installation scope** (any workspace vs selected workspaces), not the redirect URI. The model attached the sentence to the wrong field. |
| Aha! | c19 | No per-customer instance or subdomain requirement. | "The API must be accessed using the account specific domain `<yourcompany>.aha.io`." The exact opposite. |
| Aha! | c3–c9 | OAuth metadata, a DCR endpoint, scope `full`, PKCE S256 (all marked tested). | The probes are real and re-checked, but they describe **Aha's MCP server** (`mcp.aha.io`), not the REST API's OAuth on `<yourcompany>.aha.io`. Tested facts, presented as if they were about the wrong thing. |
| Linear | c11 | [tested] Linear does not advertise a dynamic client registration endpoint. | True for `api.linear.app` only. `mcp.linear.app` advertises `https://mcp.linear.app/register` (re-checked; the guide's own k6 says so). |

## Could not verify

| Guide | Claim | Why |
|---|---|---|
| Xero | c10: certification process for Core, Plus, Advanced and Enterprise tiers | The fetched FAQ mentions an "uncertified app limit" (2 uncertified apps per organisation) but not certification per tier. The **Hard** production verdict leans on this claim, so treat that verdict as provisional. |
| Xero | c7: per-tier connection limits 5 / 50 / 1,000 / 10,000 | The five tier names are in the FAQ; the numbers are not in the fetched text. They may come from a pricing page the pipeline did not fetch, or be invented. |
| Linear | c8: redirect URIs may be any HTTPS URL or localhost | Localhost appears only in example URLs. No rule was found. |

## Confirmed (selection)

- **Linear**: access token 24 hours (c3); client-credentials token 30 days (c5); 5,000 requests per hour per user for OAuth apps (c6); dynamic limits for workspace-level apps (c7). Composio's `LINEAR_MCP` is `DCR_OAUTH`, not managed (k5). `mcp.linear.app/register` exists (k6).
- **Xero**: access token 30 minutes, unused refresh token 60 days (c4); no wildcard redirect URIs (c2); up to 50 redirect URIs (c3); 5 concurrent / 60 per minute / 5,000 per day, plus 10,000 per minute per app (c6); the connecting user needs the Connected Apps permission (c11); no OAuth metadata at `api.xero.com` (c14, HTTP 401 on re-check).
- **Notion**: you must be a workspace owner to create a connection (c2); the Authorization URL appears only after a public connection is submitted for review (c4).
- **Aha!**: 300 requests per minute (c15; the guide omits the 20-per-second limit); apps must be registered before users authorise them (c2).
- **Clockify**: Composio lists `API_KEY, OAUTH2` (k1), while Clockify's API docs describe only `X-Api-Key` / `X-Addon-Token`. The guide flags this as a conflict and does not settle it, which is the intended behaviour.
- **Spotify (hand-written reference)**: new apps start in development mode; up to 5 users; the owner needs Premium (live page re-checked).

## What I learned, and what changed in the pipeline because of it

| Finding | Change |
|---|---|
| The model ignored facts we can check deterministically. The first Linear guide told a **managed** toolkit's users to create their own OAuth app, and skipped the `linear_mcp` toolkit even though the probe reported it. | Composio facts are now written in code after the audit (`lib/pipeline/composio-layer.ts`). The code reads the live toolkit pages, and each claim is tied to an exact phrase in Composio's docs; if the phrase disappears, the claim is downgraded to unverified. A managed track always opens with Composio's managed app. Every such change is recorded in the guide's audit log, labelled "in code". |
| On Clockify the model concluded "OAuth integration is not possible", contradicting Composio's catalog. | A conflict rule: if Composio lists OAuth, the provider sources found none, and the model denies OAuth, the guide gets an **Unconfirmed** headline, low confidence, a blocker and an uncertain item. |
| The model misses facts that are in its sources. Linear's page says "All OAuth2 applications were migrated to the new refresh token system on April 1, 2026"; no generated Linear guide mentions it. | Not fixed. It is model recall, and the prompts are fixed. Listed under limitations. |
| Probe results attach to the wrong thing (Aha's MCP server presented as its API OAuth). | The MCP host is now probed separately and labelled `mcpOauthMetadata`, so the code-added claim names the host. The model can still misattribute in its own claims. |
| The first search for an app returns mostly unrelated pages (Mailchimp and Indeed for "linear"). | A second search restricted to the provider's own domains, after the provider is identified. Linear went from 1–2 official pages to 5. |
| The audit stage could never pass: the code expected a guide, but the prompt returns `{ guide, auditLog, auditSummary }`. The repair retry also dropped the schema and the failed draft. | Fixed in `audit.ts` and `investigate.ts`. Failed attempts are saved to `.cache/debug/`. |

### A correction to my own starting notes

The project handoff said Linear's refresh tokens became the default "for apps created from 1 Oct 2025". Linear's current page says **all** OAuth2 applications were migrated on **1 April 2026**. The source wins.

## Not tested

- No provider OAuth app was created and no end-to-end Composio connection was made. That needs provider accounts (and a Spotify Premium account), which the brief excludes. "Tested" in these guides therefore means a live HTTP probe of a public endpoint, never a completed setup.
- Review timelines (Xero certification, Notion public-connection review) come from documentation or are marked unknown. None were observed.
- Whether Composio's redirect URI is accepted by each provider's validation.
