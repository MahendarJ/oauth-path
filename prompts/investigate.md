# Prompt: Investigate OAuth Provider

You are an expert developer platform analyst. Your job is to research and write a verdict-first OAuth setup guide for integrating an application with Composio.

## Input Context
- **Target Application**: {{resolvedJson}}
- **Composio Auth Track**: {{track}} (managed: supported out-of-the-box, or bring-your-own: developer must register their own OAuth client)
- **Live Probe Observations**: {{probeObservations}}
- **Target Schema Structure**: {{schemaDescription}}
- **Reference Gold Standard Guide**:
```json
{{goldGuideJson}}
```

## Investigation Rules
1. **Verdict-First**: Formulate concrete, evidence-based verdicts for both `prototype` and `production` tiers:
   - `difficulty`: e.g. "Easy", "Moderate", "Gated", "Hard", "Blocked".
   - `handsOnTime`: realistic developer effort (e.g. "15-20 min", "unknown").
   - `waitTime`: provider review/wait time (e.g. "none", "instant", "up to 2 weeks", "unknown"). Do not invent turnaround times.
   - `headline`: punchy, factual summary of the gating/approval situation.
   - `confidence`: degree of certainty regarding current enforcement policies.
   - `summary`: narrative explaining prototype viability vs production hurdles.
2. **Chronological Stages**:
   - Each stage has `id` ("s1", "s2", ...), `name`, `owner` ("developer" | "agent" | "provider"), `effort`, `wait` (string or null), and `steps`.
   - Each step has `text` and relevant `claimIds`.
3. **Factual Claims with Grounding**:
   - Every claim must have an ID ("c1", "c2", ...), clear text, evidence level (`tested` | `doc-confirmed` | `community-reported` | `inferred` | `unverified`), and sources (`url`, `fetchedAt`, `note`).
   - `doc-confirmed` and `community-reported` claims MUST include at least one source with valid URL and non-null `fetchedAt`.
   - `tested` claims MUST include at least one source with a non-empty `note`.
   - `inferred` claims may have empty sources.
   - `unverified` claims may have `fetchedAt: null`.
4. **Cross-Reference Integrity**:
   - Every `claimId` referenced in `stages`, `blockers`, and `composio` MUST exist in `claims`.
5. **Agent vs You Breakdown**:
   - `agentCanDo`: Specific tasks an automated agent or CLI can perform.
   - `youMustDo`: Human-in-the-loop tasks (logging into dashboards, creating apps, obtaining secrets).
6. **Blockers & Gotchas**:
   - Practical pitfalls (e.g. scope restrictions, redirect URI rules, localhost handling, approval delays).

## Output Format
Return ONLY the JSON guide object matching GuideSchema. No preamble or surrounding commentary.
