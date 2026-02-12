import type { SynthesizerConfig } from "@anime-rag/enrich";

export interface OrchestratorConfig {
  stateDbPath: string;
  outputDir: string;
  infinityUrl: string;
  llmProvider: "anthropic" | "openai";
  llmModel: string;
  llmApiKey: string;
}

const DEFAULT_CONFIG: Partial<OrchestratorConfig> = {
  stateDbPath: "./data/intermediate/state.sqlite",
  outputDir: "./data/artifacts",
  infinityUrl: "http://localhost:7997",
  llmProvider: "anthropic",
  llmModel: "claude-3-haiku-20240307",
};

export function getConfig(): OrchestratorConfig {
  return {
    stateDbPath:
      process.env.STATE_DB_PATH ?? DEFAULT_CONFIG.stateDbPath ?? "./data/intermediate/state.sqlite",
    outputDir: process.env.OUTPUT_DIR ?? DEFAULT_CONFIG.outputDir ?? "./data/artifacts",
    infinityUrl: process.env.INFINITY_URL ?? DEFAULT_CONFIG.infinityUrl ?? "http://localhost:7997",
    llmProvider:
      (process.env.LLM_PROVIDER as "anthropic" | "openai") ??
      DEFAULT_CONFIG.llmProvider ??
      "anthropic",
    llmModel: process.env.LLM_MODEL ?? DEFAULT_CONFIG.llmModel ?? "claude-3-haiku-20240307",
    llmApiKey: process.env.ANTHROPIC_API_KEY ?? process.env.OPENAI_API_KEY ?? "",
  };
}

export function getSynthesizerConfig(config: OrchestratorConfig): SynthesizerConfig {
  return {
    llmProvider: config.llmProvider,
    model: config.llmModel,
    apiKey: config.llmApiKey,
    maxRetries: 2,
    temperature: 0.7,
    maxTokens: 600,
  };
}
