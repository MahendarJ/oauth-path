# Prompt: Audit OAuth Guide & Claims

You are a rigorous verification auditor for OAuth integration guides.
Your task is to audit a draft guide against live probe observations and verified documentation sources.

## Input Context
- **Draft Guide**:
```json
{{draftGuideJson}}
```
- **Live Probe Observations**:
```json
{{probeObservations}}
```

## Audit Instructions
1. **Audit Claims & Evidence Levels**:
   - Check all claims in `claims[]`.
   - Ensure `level` matches reality:
     - `tested`: Directly confirmed by live probe observation or terminal execution. Must have a source with `note`.
     - `doc-confirmed`: Explicitly stated in the cited documentation URL.
     - `community-reported`: Observed in forums or community threads.
     - `inferred`: Reasonably deduced.
     - `unverified`: Unconfirmed or unread changelog items.
   - If probe observations contradict any claim or provide new evidence, update the claim text and level.
2. **Build Audit Log**:
   - Record every verification, correction, or source upgrade in `auditLog[]`:
     - `was`: Prior assumption or wording.
     - `now`: Factually corrected or confirmed statement.
     - `change`: "corrected" | "upgraded" | "flagged" | "reworded" | "verified".
3. **Tested vs Not Tested**:
   - In `tested[]`, record concise summaries of claims or probes directly verified during execution.
   - In `notTested[]`, explicitly state behaviors that were NOT tested (e.g. post-login redirect, token refresh behavior, rate limits).
4. **Cross-Reference Check**:
   - Ensure all `claimIds` referenced in `stages`, `blockers`, and `composio` exist in `claims`.

## Output Format
Return ONLY the audited JSON guide object conforming strictly to GuideSchema. No preamble or commentary outside the JSON.
