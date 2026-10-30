export interface ProbeObservation {
  probe: string;
  url: string;
  checkedAt: string;
  status: number | string;
  error?: string;
  facts: Record<string, unknown>;
  evidence: "tested" | "doc-confirmed";
}

export type ComposioTrack = "managed" | "bring-your-own" | "unknown";
