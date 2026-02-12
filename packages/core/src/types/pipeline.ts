import type { ProviderName, ProviderResponse } from "./provider";

export type PipelineStatus = "pending" | "in_progress" | "complete" | "failed" | "insufficient";

export interface PipelineEntry {
  animeId: string;
  manamiVersion: string;
  sources: Record<ProviderName, ProviderResponse | null>;
  synopsisInputs: number;
  synthesisStatus: PipelineStatus;
  embeddingStatus: PipelineStatus;
  lastUpdated: string;
}

export interface PipelineRun {
  runId: string;
  runType: "initial_load" | "weekly_update";
  manamiVersion: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  stats: PipelineStats | null;
}

export interface PipelineStats {
  totalEntries: number;
  fetched: number;
  synthesized: number;
  embedded: number;
  failed: number;
  insufficient: number;
}
