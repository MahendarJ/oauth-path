# OAuth Path

Look up an app and find out, before you build, whether you need your own OAuth app, how long it takes to get it ready for real users, what can block you, and which parts an agent can do for you. Type any app name or docs URL and an agent investigates it live and produces a guide you can share.

**Live:** https://oauth-path-virid.vercel.app · **Source:** https://github.com/MahendarJ/oauth-path · **Verification:** [VERIFICATION.md](VERIFICATION.md)

## The problem, as I understood it

A developer's agent needs their users to connect an app (Linear, Xero, Spotify…). Each user connection is an OAuth grant to an **OAuth app**: the client ID and secret registered with the provider. Whoever owns that app owns the consent screen, the scopes, the quota and the provider's approval process.

With Composio there are two cases:

- **Managed (125 toolkits):** Composio already owns an approved OAuth app. A developer can connect users today and may never need their own.
- **Bring your own (262 toolkits):** the developer must register an app with the provider, sometimes pass a review, then give the credentials to Composio.

So the first question a developer has is not "how do I do OAuth" but "**do I need my own app at all, and if so, is it an hour of work or weeks of waiting?**" The guides are built around that question.

## What you get

- **Library** of guides for apps with different setup challenges:

  | App | Setup challenge |
  |---|---|
  | Linear | Managed; separate MCP toolkit with dynamic client registration |
  | Notion | Managed; public connections need Notion's review |
  | Aha! | Bring your own; per-account subdomain |
  | Xero | Bring your own; tiers and certification for production |
  | Clockify | Sources conflict on whether OAuth exists |
  | Spotify | Hand-researched reference; easy prototype, gated production |

- **Live generation** for any name or URL, with streamed progress through four stages: Resolve, Probe, Investigate, Audit.
- **A guide page per app** at `/guides/<slug>`, shareable by URL, with:
  - **Verdict first:** prototype and production cards with difficulty, hands-on time and waiting time, plus confidence and one "Do this next".
  - **What an agent can do / What you must do.**
  - **Steps**, each owned by You, Agent or Provider, with effort and waits.
  - **Blockers** with what to do and where to escalate.
  - **Tested / Not tested / Uncertain**, kept separate.
  - **Evidence table:** every claim has a level (tested, docs, community, inferred, unverified), its source URL and fetch date, and whether a person checked it.
  - **Audit log:** what the audit changed, including corrections applied in code.

## Key product decisions

1. **The verdict comes first, split into prototype and production.** These are different problems. Most apps are easy to try and hard to ship (Spotify: 5 users in development mode, a 250k MAU bar for extended quota). A single difficulty score would hide the part that matters.
2. **Composio's managed app is the starting point when it exists.** For a managed toolkit, the guide opens with "No OAuth app needed to start". Your own app becomes an option with explicit reasons: your name on the consent screen, custom scopes, dedicated quota, polling faster than 2 minutes. This is set in code, not left to the model, because the model got it wrong in testing (see VERIFICATION.md).
3. **Every claim carries its evidence, and "unknown" is a valid answer.** Review timelines are where developers get burned and where sources are thinnest. The guide says "unknown" rather than invent a number, and keeps tested, documented, community and inferred claims visibly apart.
4. **"Tested" means something real.** An agent ran a live HTTP probe in this run: OAuth discovery (RFC 8414 and OIDC), protected-resource metadata (RFC 9728), the authorize endpoint with a deliberately invalid client, whether dynamic client registration is advertised, and the provider's MCP host. Nothing is marked tested because a doc says so.
5. **The agent investigates; code keeps it honest.**
   - Search results and model-picked URLs are fetched and verified in code. Dead links, off-domain redirects and empty pages are dropped, never replaced.
   - The model has no tools and may only cite pages that were actually fetched.
   - A second model pass audits the draft against the same sources.
   - Facts code can check directly (Composio's catalog, probe results, managed-track rules, source conflicts) are written in code after the audit, and each change is logged.
   - If nothing can be verified, the agent stops and asks for a docs URL instead of guessing.
6. **Conflicts are shown, not settled.** Clockify's docs describe only API keys, while Composio's catalog lists OAuth2. The guide marks its verdict "Unconfirmed" and adds a blocker telling the developer what to ask and whom.
7. **The guide draws a clear line between agent and human.** Agents can run probes, draft auth configs, generate Connect Links, run test calls and pre-fill review forms. Humans own accounts, legal entities, payment, business verification, consoles behind 2FA, and anything a provider must approve.
8. **Focused scope.** Getting from "I want users to connect X" to an app that is ready for real users, and wired into Composio. Not general OAuth tutorials, not API usage after connection, not automated app creation in provider consoles (that needs accounts and human sign-in).

## What was tested, what is sourced, what is unknown

- **Tested (live probes on every run):** OAuth server metadata, protected-resource metadata, authorize-endpoint behaviour with an invalid client, dynamic client registration advertised or not, MCP host metadata, and Composio's live toolkit pages.
- **Sourced:** claims cite provider pages fetched during the run (up to 8 pages; total text capped at 32k characters). 25 sampled claims were checked by hand: 18 confirmed, 4 corrected, 3 not verifiable from the fetched text. See [VERIFICATION.md](VERIFICATION.md).
- **Not tested:** creating a provider app, completing a provider review, and an end-to-end Composio connection. These need provider accounts, which the brief excludes.

## Setup

Requirements: Node 20+.

```bash
npm install
cp .env.example .env   # then fill in the values below
npm run dev            # http://localhost:3000
```

| Variable | What it is |
|---|---|
| `LLM_BASE_URL` | Any OpenAI-compatible chat completions API, e.g. `https://api.cerebras.ai/v1` |
| `LLM_API_KEY` | Key for that provider (Cerebras has a free tier) |
| `LLM_MODEL` | Model id, e.g. `gpt-oss-120b` |
| `TAVILY_API_KEY` | Tavily web search (free tier: 1,000 credits/month; about 2–3 per new guide) |
| `BLOB_READ_WRITE_TOKEN` | Deployed only: Vercel Blob store for guides generated live (set automatically when you connect a Blob store) |

Command line:

```bash
npm run generate -- "linear"                  # name or URL; add --fresh to regenerate
npm run evidence -- linear "valid for 24 hours"  # search a guide's fetched sources while checking claims
npm run validate                              # schema-check every guide in guides/
npm test && npm run typecheck
```

### Deploying (Vercel)

1. Import the repository in Vercel.
2. Add `LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL` and `TAVILY_API_KEY` under Settings → Environment Variables.
3. Create a Blob store (Storage → Blob) and connect it to the project; this sets `BLOB_READ_WRITE_TOKEN`. Without it, guides generated live are kept in the function's temp directory and their share links stop working after a cold start.
4. The generate route asks for up to 300 seconds (`maxDuration`). A run takes 2–3 minutes; check that your plan allows that duration.

## Credentials

No credentials are in this repository or its history.

- `.env` is git-ignored and has never been committed; `.env.example` holds placeholders only.
- A repository scan for key patterns (Cerebras, Groq, Tavily, Google, OpenAI) finds nothing.
- Provider error messages are logged with the API key redacted.
- The probes never send credentials: they are GET requests to public endpoints, with an invalid client ID where a client is needed.
- Deployed keys live only in the host's environment settings.

## Limitations

- **Model thoroughness varies between runs.** Two runs on Linear gave 32 and 20 claims, and the model misses facts that are in its sources (Linear's 1 April 2026 refresh-token migration). The free-tier model (`gpt-oss-120b` on Cerebras) trades depth for cost.
- **Probe results can be misattributed.** For Aha!, the model described the MCP server's OAuth as if it were the REST API's. Recorded as a correction in VERIFICATION.md.
- **Search quality varies.** A name search sometimes finds no verifiable official page; the agent then stops and asks for a docs URL. Very large single-page docs (over 5 MB) are refused, and only the first part of large pages is read.
- **Speed.** A live run takes 2–3 minutes because the free tier allows 30k tokens per minute; the agent waits and retries rather than failing.
- **Library size.** Six guides, not 100. The same pipeline generates any toolkit (`npm run generate -- "<name>" --fresh`). A batch over Composio's 262 bring-your-own toolkits, plus a human sampling pass per batch, is the path to 100.
- **Human corrections sit beside the guides, not in them.** Corrected claims are flagged on the page, but the guide text is left as generated. Regenerating does not yet take earlier corrections into account.
- **Composio catalog data** combines a 2026-10-30 snapshot (`data/*-slugs.json`) with live toolkit pages read on each run.
