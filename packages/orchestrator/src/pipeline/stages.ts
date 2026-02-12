import type { PipelineStatus } from "@anime-rag/core";
import type { StateEntry } from "../state/queries";

export interface StageResult {
  animeId: string;
  status: PipelineStatus;
  data?: unknown;
  error?: string;
}

export interface Stage {
  name: string;
  prerequisite: string | null;
  statusField: "fetch_status" | "synthesis_status" | "embedding_status";
  process(entries: StateEntry[]): AsyncGenerator<StageResult>;
}

export const STAGES = {
  FETCH: "fetch",
  SYNTHESIZE: "synthesize",
  EMBED: "embed",
} as const;
