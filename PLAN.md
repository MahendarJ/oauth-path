# OAuth Path - Implementation Plan

"OAuth Path" is a Next.js (TypeScript, App Router) web application providing a verdict-first guide for developers setting up and obtaining approval for provider OAuth apps, specifically tailored for use with Composio's custom auth configurations.

Composio provides managed OAuth apps for ~125 toolkits; for ~262 others, developers must register their own OAuth app and configure custom auth credentials. OAuth Path targets this second group to demystify provider registration, approval workflows, gotchas, and Composio configuration.

---

## Core Guiding Principles

1. **Verdict-First**: Give developers an immediate appraisal (prototype vs. production difficulty, hands-on time, wait time/review timeline, confidence score, headline verdicts, and actionable summary) before diving into deep steps.
2. **Every Claim Grounded (5 Evidence Levels)**:
   - `tested`: Directly executed, tested end-to-end and verified working.
   - `doc-confirmed`: Explicitly documented in official provider or Composio documentation.
   - `community-reported`: Reported by developers in official community forums, issue trackers, or threads.
   - `inferred`: Reasonably deduced from related provider behaviors, API docs, or standard OAuth 2.0 specs.
   - `unverified`: Identified changes or claims where exact details/changelogs have not yet been directly read or verified.
3. **Strict Source & Verification Rules**:
   - `doc-confirmed` and `community-reported` claims need at least one source with `url` and `fetchedAt`.
   - `inferred` claims may have no sources.
   - `unverified` claims may have a null `fetchedAt`.
   - Every `claimId` referenced in stages, blockers, and composio must exist in `claims`.
4. **No Invented Timelines**: `unknown` is an explicit, valid answer. If a provider's review duration is undocumented or highly variable, do not invent artificial turnaround figures. Upper bounds (e.g. "Up to 6 weeks") are attributed explicitly.
5. **Actionable Composio Tail**: Maintained as a deterministic code constant (`COMPOSIO_TAIL`) rather than duplicated per-guide data.

---

## Milestones

### Milestone 1: Schema & Data Model (Step 1 - Current)
- [x] Define comprehensive Zod schema in `lib/schema.ts` representing `Guide`, `Verdict` (prototype + production tiers), `Stage`, `Blocker`, `Claim` (5 evidence levels), `AgentVsYou`, `AuditLog`, and `ComposioConfig`.
- [x] Integrate gold-standard reference guide in `guides/_gold.json` (Spotify BYO research fixture).
- [x] Implement schema validator script (`scripts/validate.ts`) with strict cross-field claimId verification.
- [x] Set up `.env.example` with `ANTHROPIC_API_KEY`.
- [x] Establish strict TypeScript configurations and build foundation.

### Milestone 2: Probes (Data Collection & Auth Discovery)
- [ ] Build provider probing utilities to fetch and parse official OAuth documentation, developer portal URLs, redirect requirements, and app submission policies.
- [ ] Create Composio catalog scraper/catalog reader distinguishing managed (~125) vs bring-your-own (~262) apps.
- [ ] Implement documentation crawler with rate-limiting, source attribution metadata capture (`url`, `fetchedAt`), and snapshot caching.
- [ ] Probe common OAuth parameters: Authorization URL, Token URL, Scope syntax, PKCE requirements, Refresh token lifetimes, and localhost/production redirect URI restrictions.

### Milestone 3: Agent Pipeline (Research, Synthesis & Guide Generation)
- [ ] Build Claude (Anthropic API) generation pipeline with structured output.
- [ ] Implement multi-stage agent workflow:
  1. **Researcher Agent**: Ingests raw provider docs, developer portal terms, announcements, changelogs, and Composio requirements.
  2. **Claims & Stage Extractor**: Decomposes steps into stages owned by `developer`, `agent`, or `provider` with associated `claimIds`.
  3. **Verdict Synthesizer**: Computes prototype and production difficulty ratings, realistic hands-on times, wait times (or marks `unknown`), and writes executive headline verdicts.
  4. **Claim Verifier**: Flags ungrounded claims, assigns evidence levels (`tested`, `doc-confirmed`, `community-reported`, `inferred`, `unverified`), verifies sources, and builds the audit log of corrections.
  5. **Agent vs. You Allocator**: Splits responsibilities between automated agent capabilities and tasks the developer must perform manually.
- [ ] CLI tool (`npm run generate-guide -- --app <name>`) to run pipeline for any supported provider and output validated JSON to `guides/<slug>.json`.

### Milestone 4: Next.js UI (App Router, Verdict-First UX)
- [ ] Next.js 15+ App Router application with Tailwind CSS and modern styling.
- [ ] **Home & Catalog Page** (`/`):
  - Searchable list of all ~262 BYO providers with search and tag filters.
  - Quick-verdict badges (e.g. "Prototype: Easy", "Production: Gated", "Requires Organization").
- [ ] **Guide Detail Page** (`/guides/[slug]`):
  - **Verdict Header**: Two-column prototype vs. production verdict card featuring difficulty badge, hands-on time, wait time, confidence, and headline summary.
  - **Stage Tracker & Step-by-Step Walkthrough**: Visual stage cards with owners (`developer`, `agent`, `provider`), effort estimates, waiting steps, and clickable claim citations.
  - **Agent vs. You Division**: Interactive view contrasting what the agent can automate vs what developer must execute.
  - **Requirements & Pre-requisites Checklist**: Requirements list (e.g. Premium account, HTTPS redirect).
  - **Blockers & Pitfalls Drawer**: "When it hits", "What to do", and "Escalation path" for known traps with claim links.
  - **Evidence & Claims Inspector**: Interactive drawer displaying claim trust levels and citations with fetched dates and notes.
  - **Composio Integration Section**: Standard instructions with code snippet for custom auth configs.

### Milestone 5: Verification & Quality Assurance
- [ ] Automated validation test suite running `zod` against all saved guide files.
- [ ] Veracity & Claim Linter enforcing:
  - `doc-confirmed` and `community-reported` claims need at least one source with url and fetchedAt.
  - `inferred` claims may have no sources.
  - `unverified` claims may have a null fetchedAt.
  - Every `claimId` referenced in stages, blockers, and composio must exist in claims.
- [ ] Automated Next.js build and TypeScript type-checking (`npm run typecheck` & `npm run build`).
- [ ] Responsive design testing for mobile and desktop screens.

### Milestone 6: Documentation & Production Readiness
- [ ] Complete `README.md` detailing:
  - Architecture overview and design goals.
  - Local development and running instructions.
  - Guide schema specification.
  - Instructions for running the probe and agent generation pipeline.
  - How to add or contribute a new provider guide.
- [ ] Clean environment configuration and deployment guide (Vercel ready).
