import { Guide } from "../schema";

export type PipelineEvent =
  | { type: "resolving"; app: string }
  | { type: "probing"; target: string }
  | { type: "investigating"; app: string; track: string }
  | { type: "auditing"; claimsCount: number }
  | { type: "done"; slug: string; path: string; guide: Guide }
  | { type: "error"; message: string };

export type EventEmitter = (event: PipelineEvent) => void;
