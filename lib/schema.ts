import { z } from "zod";

/**
 * Claim verification levels (5 levels):
 * - tested: Directly executed, tested end-to-end and verified working.
 * - doc-confirmed: Explicitly documented in official provider or Composio documentation.
 * - community-reported: Reported by developers in official community forums, issue trackers, or threads.
 * - inferred: Reasonably deduced from related provider behaviors, API docs, or standard OAuth 2.0 specs.
 * - unverified: Identified changes or claims where exact details/changelogs have not yet been directly read or verified.
 */
export const ClaimLevelSchema = z.enum([
  "tested",
  "doc-confirmed",
  "community-reported",
  "inferred",
  "unverified",
]);
export type ClaimLevel = z.infer<typeof ClaimLevelSchema>;

/**
 * Source citation for an evidence claim.
 */
export const ClaimSourceSchema = z.object({
  url: z.string().url("Source must be a valid URL"),
  fetchedAt: z.string().nullable(),
  note: z.string().optional(),
});
export type ClaimSource = z.infer<typeof ClaimSourceSchema>;

/**
 * Evidence claim. Every factual claim in the guide must have an evidence level and source.
 * Validation rules:
 * - doc-confirmed and community-reported claims need at least one source with url and fetchedAt
 * - tested claims need at least one source with a non-empty note
 * - inferred claims may have no sources
 * - unverified claims may have a null fetchedAt
 */
export const ClaimSchema = z
  .object({
    id: z.string().min(1, "Claim ID is required"),
    text: z.string().min(1, "Claim text is required"),
    level: ClaimLevelSchema,
    sources: z.array(ClaimSourceSchema),
  })
  .superRefine((claim, ctx) => {
    if (claim.level === "doc-confirmed" || claim.level === "community-reported") {
      if (!claim.sources || claim.sources.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${claim.level} claims need at least one source with url and fetchedAt`,
          path: ["sources"],
        });
      } else {
        const hasValidSource = claim.sources.some(
          (s) => s.url && typeof s.fetchedAt === "string" && s.fetchedAt.trim().length > 0
        );
        if (!hasValidSource) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${claim.level} claims need at least one source with url and non-null fetchedAt`,
            path: ["sources"],
          });
        }
      }
    }

    if (claim.level === "tested") {
      if (!claim.sources || claim.sources.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "tested claims need at least one source with a non-empty note",
          path: ["sources"],
        });
      } else {
        const hasSourceWithNote = claim.sources.some(
          (s) => typeof s.note === "string" && s.note.trim().length > 0
        );
        if (!hasSourceWithNote) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "tested claims need at least one source with a non-empty note",
            path: ["sources"],
          });
        }
      }
    }
  });
export type Claim = z.infer<typeof ClaimSchema>;

/**
 * Auth track for Composio toolkits:
 * - managed: Supported directly by Composio out-of-the-box (~125 toolkits).
 * - bring-your-own: Developer registers their own OAuth app & creates a custom auth config (~262 toolkits).
 */
export const TrackSchema = z.enum(["managed", "bring-your-own"]);
export type Track = z.infer<typeof TrackSchema>;

/**
 * Composio metadata for the toolkit.
 */
export const ComposioConfigSchema = z.object({
  toolkitSlug: z.string().min(1, "toolkitSlug is required"),
  managedOAuthAvailable: z.boolean(),
  claimIds: z.array(z.string()).default([]),
});
export type ComposioConfig = z.infer<typeof ComposioConfigSchema>;

/**
 * Verdict sub-breakdown for prototype vs production tiers.
 */
export const VerdictTierSchema = z.object({
  difficulty: z.string().min(1, "Difficulty is required"),
  handsOnTime: z.string().min(1, "handsOnTime is required"),
  waitTime: z.string().min(1, "waitTime is required"),
  headline: z.string().min(1, "headline is required"),
});
export type VerdictTier = z.infer<typeof VerdictTierSchema>;

/**
 * Verdict metrics, confidence, and executive summary.
 */
export const VerdictSchema = z.object({
  prototype: VerdictTierSchema,
  production: VerdictTierSchema,
  confidence: z.string().min(1, "Confidence description is required"),
  summary: z.string().min(1, "Summary is required"),
});
export type Verdict = z.infer<typeof VerdictSchema>;

/**
 * Stage owner:
 * - developer: Action must be performed by human developer in provider portal.
 * - agent: Automated agent/script can execute or assist this step.
 * - provider: Waiting on provider automated checks, manual review, or provisioning.
 */
export const StageOwnerSchema = z.enum(["developer", "agent", "provider"]);
export type StageOwner = z.infer<typeof StageOwnerSchema>;

/**
 * Individual step within a stage, citing relevant claimIds.
 */
export const StageStepSchema = z.object({
  text: z.string().min(1, "Step text is required"),
  claimIds: z.array(z.string()).default([]),
});
export type StageStep = z.infer<typeof StageStepSchema>;

/**
 * Stage representing a chronological milestone in setup.
 */
export const StageSchema = z.object({
  id: z.string().min(1, "Stage id is required"),
  name: z.string().min(1, "Stage name is required"),
  owner: StageOwnerSchema,
  effort: z.string().min(1, "Effort estimate is required"),
  wait: z.string().nullable(),
  steps: z.array(StageStepSchema).min(1, "Stage must contain at least one step"),
});
export type Stage = z.infer<typeof StageSchema>;

/**
 * Known blocker or edge case encountered during registration/approval.
 */
export const BlockerSchema = z.object({
  issue: z.string().min(1, "Blocker issue description is required"),
  whenItHits: z.string().min(1, "Context of when issue occurs is required"),
  whatToDo: z.string().min(1, "Resolution or workaround is required"),
  escalation: z.string().nullable(),
  claimIds: z.array(z.string()).default([]),
});
export type Blocker = z.infer<typeof BlockerSchema>;

/**
 * Separation of tasks between developer and automated agent.
 */
export const AgentVsYouSchema = z.object({
  agentCanDo: z.array(z.string()),
  youMustDo: z.array(z.string()),
});
export type AgentVsYou = z.infer<typeof AgentVsYouSchema>;

/**
 * Audit log entry recording corrections and source upgrades.
 */
export const AuditLogEntrySchema = z.object({
  was: z.string().min(1, "Previous state description is required"),
  now: z.string().min(1, "Current state description is required"),
  change: z.string().min(1, "Change type is required"),
});
export type AuditLogEntry = z.infer<typeof AuditLogEntrySchema>;

/**
 * Composio Tail: Fixed steps for configuring custom OAuth credentials into Composio.
 * Kept as code constant rather than per-guide data.
 */
export const COMPOSIO_TAIL = [
  "In the Composio dashboard go to Auth Configs, click Create Auth Config, select the toolkit and choose OAuth2.",
  "Copy the redirect URI shown in the Composio dashboard and register it in the provider's app settings.",
  "Copy the Client ID and Client Secret from the provider app overview into the Composio auth config, and click Create.",
  "Copy the resulting auth config ID (looks like ac_xxxx). Keep secrets out of source control.",
  "Pass the auth config ID to your session: authConfigs: { [toolkit]: 'ac_xxxx' }. Toolkits not listed keep using Composio managed auth.",
] as const;

/**
 * Top-level Guide Schema.
 * Includes cross-field validation ensuring every referenced claimId exists in claims list.
 */
export const GuideSchema = z
  .object({
    app: z.string().min(1, "App name is required"),
    slug: z
      .string()
      .min(1, "Slug is required")
      .regex(/^[a-z0-9-]+$/, "Slug must be lowercase alphanumeric with hyphens"),
    generatedAt: z.string().min(1, "generatedAt timestamp is required"),
    generatedBy: z.string().min(1, "generatedBy attribution is required"),
    track: TrackSchema,
    composio: ComposioConfigSchema,
    verdict: VerdictSchema,
    stages: z.array(StageSchema).min(1, "At least one stage is required"),
    requirements: z.array(z.string()),
    blockers: z.array(BlockerSchema),
    agentVsYou: AgentVsYouSchema,
    claims: z.array(ClaimSchema).min(1, "At least one evidence claim is required"),
    uncertain: z.array(z.string()),
    tested: z.array(z.string()),
    notTested: z.array(z.string()),
    auditLog: z.array(AuditLogEntrySchema),
    nextAction: z.string().min(1, "nextAction is required"),
    composioTail: z.array(z.string()).optional(),
  })
  .superRefine((guide, ctx) => {
    const claimIdsSet = new Set(guide.claims.map((c) => c.id));

    // Validate composio claimIds
    (guide.composio.claimIds || []).forEach((claimId, index) => {
      if (!claimIdsSet.has(claimId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Referenced claimId "${claimId}" does not exist in claims list`,
          path: ["composio", "claimIds", index],
        });
      }
    });

    // Validate stage step claimIds
    guide.stages.forEach((stage, stageIndex) => {
      stage.steps.forEach((step, stepIndex) => {
        (step.claimIds || []).forEach((claimId, claimIndex) => {
          if (!claimIdsSet.has(claimId)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `Referenced claimId "${claimId}" does not exist in claims list`,
              path: ["stages", stageIndex, "steps", stepIndex, "claimIds", claimIndex],
            });
          }
        });
      });
    });

    // Validate blocker claimIds
    guide.blockers.forEach((blocker, blockerIndex) => {
      (blocker.claimIds || []).forEach((claimId, claimIndex) => {
        if (!claimIdsSet.has(claimId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Referenced claimId "${claimId}" does not exist in claims list`,
            path: ["blockers", blockerIndex, "claimIds", claimIndex],
          });
        }
      });
    });
  });

export type Guide = z.infer<typeof GuideSchema>;

/**
 * Validates guide data against GuideSchema.
 * Throws ZodError if invalid.
 */
export function validateGuide(data: unknown): Guide {
  return GuideSchema.parse(data);
}

/**
 * Safe validation returning boolean and formatted errors.
 */
export function safeValidateGuide(data: unknown): {
  success: boolean;
  data?: Guide;
  error?: z.ZodError;
} {
  return GuideSchema.safeParse(data);
}
