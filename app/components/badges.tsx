import type { ClaimLevel, StageOwner, Track } from "@/lib/schema";

export const LEVEL_LABEL: Record<ClaimLevel, string> = {
  tested: "Tested",
  "doc-confirmed": "Docs",
  "community-reported": "Community",
  inferred: "Inferred",
  unverified: "Unverified",
};

export const LEVEL_HELP: Record<ClaimLevel, string> = {
  tested: "Checked by a live probe in this run",
  "doc-confirmed": "Stated in a fetched official page",
  "community-reported": "Reported in a fetched forum or issue thread",
  inferred: "Reasoned from other facts, not stated anywhere",
  unverified: "Could not be checked",
};

export function LevelBadge({ level }: { level: ClaimLevel }) {
  return (
    <span className={`badge level-${level}`} title={LEVEL_HELP[level]}>
      {LEVEL_LABEL[level]}
    </span>
  );
}

function difficultyClass(difficulty: string): string {
  const d = difficulty.toLowerCase();
  if (d.startsWith("easy")) return "diff-easy";
  if (d.startsWith("moderate")) return "diff-moderate";
  if (d.startsWith("hard")) return "diff-hard";
  if (d.startsWith("gated")) return "diff-gated";
  return "diff-unknown";
}

export function DifficultyBadge({ difficulty }: { difficulty: string }) {
  return <span className={`badge ${difficultyClass(difficulty)}`}>{difficulty}</span>;
}

export function TrackBadge({ track }: { track: Track }) {
  return track === "managed" ? (
    <span className="badge track-managed" title="Composio provides the OAuth app">Composio-managed OAuth</span>
  ) : (
    <span className="badge track-byo" title="You register the OAuth app with the provider">Bring your own OAuth app</span>
  );
}

const OWNER_LABEL: Record<StageOwner, string> = { developer: "You", agent: "Agent", provider: "Provider" };

export function OwnerBadge({ owner }: { owner: StageOwner }) {
  return <span className={`badge owner-${owner}`}>{OWNER_LABEL[owner]}</span>;
}
