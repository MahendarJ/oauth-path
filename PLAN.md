# OAuth Path: architecture and status

This file records how the system is built and what is done. Product reasoning and setup are in [README.md](README.md); claim checks are in [VERIFICATION.md](VERIFICATION.md).

## Principles

1. **Verdict first.** A prototype tier and a production tier, each with difficulty (Easy, Moderate, Hard, Gated), hands-on time, waiting time and a headline, followed by one "Do this next".
2. **Composio first.** On the managed track (125 toolkits) the guide starts with Composio's managed app. On the bring-your-own track (262) it ends with the fixed Composio auth-config steps (`COMPOSIO_TAIL`, defined in code).
3. **Every claim carries evidence.** Five levels: `tested` (a live probe in this run), `doc-confirmed`, `community-reported`, `inferred`, `unverified`. "Unknown" is a valid answer, and timelines are never invented.
4. **Model output is checked by code.** Search and URL verification, probes and Composio facts run in code. The model has no tools and may cite only pages that were fetched.

## Pipeline (`lib/pipeline/`)

| Stage | Done by | What happens |
|---|---|---|
| Resolve | Tavily + model + code | **Name input:** two web searches, and the model picks only from the results. **URL input:** the page is fetched and its links extracted, and the model picks only from those links. Code fetches and verifies every picked URL (HTTP 200, on the provider's domain, real text), then runs a second search limited to the provider's domain. It stops and asks for a docs URL if nothing verifies. |
| Fetch and probe | code | Up to 8 pages, 32k characters of text in total. Probes: OAuth/OIDC discovery, RFC 9728 protected-resource metadata, the authorize endpoint with an invalid client, whether dynamic client registration is advertised, the MCP host (`mcp.<domain>`), Composio's catalog snapshot, and Composio's live toolkit pages. Every request goes through an SSRF guard. |
| Investigate | model | Drafts the guide from the sources and probe results only. Validated with Zod, with one repair retry that receives the schema, the example and the failed draft. |
| Audit | model | Re-checks the draft against the same sources and returns `{ guide, auditLog, auditSummary }`. One repair retry. |
| Code layer | code | Removes duplicate claims. Adds Composio claims (k1–k7), each tied to an exact phrase in Composio's docs. Applies the managed-track start and the source-conflict rule. Logs every change in the audit log. |

The model is any OpenAI-compatible endpoint (`LLM_BASE_URL`, `LLM_MODEL`); currently `gpt-oss-120b` on Cerebras. Prompts live in `prompts/*.md`; they are versioned and loaded at runtime.

## Storage (`lib/store.ts`)

- Library guides ship in `guides/`. `_gold.json` is the hand-researched Spotify reference; every other file is model output with a generation log.
- Guides generated live go to Vercel Blob when deployed and to `guides/` locally.
- Caches go to `.cache/` locally and to the temp directory on Vercel.

## UI (`app/`)

- `/`: search (name or URL) and the library.
- `/generate?q=`: live progress streamed from `/api/generate` (server-sent events).
- `/guides/<slug>`: the shareable guide. Verdict, agent vs you, steps, requirements, blockers, tested / not tested / uncertain, the evidence table with human checks, and the audit log.

## Status

- [x] Schema and validation (`lib/schema.ts`, `npm run validate`)
- [x] Probes with an SSRF guard, and tests
- [x] Pipeline on free-tier providers (Cerebras, Tavily)
- [x] Code layer for Composio facts, managed track, conflicts and duplicates
- [x] Web UI with live generation and share links
- [x] Six guides: Linear, Notion, Aha!, Xero, Clockify, Spotify (reference)
- [x] VERIFICATION.md: 25 claims checked by hand, shown in the UI
- [x] README and deployment readiness (Blob storage, bundled runtime files)
- [ ] Deployed URL in the README
- [ ] Next: batch generation over Composio's bring-your-own toolkits, with a human sampling pass per batch, and feeding earlier corrections into regeneration
