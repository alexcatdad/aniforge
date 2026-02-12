import { EMBEDDING_CONFIG, type EmbeddingPrefix } from "@anime-rag/core";

export interface InfinityConfig {
  baseUrl: string;
  model: string;
  batchSize: number;
  timeoutMs: number;
}

export interface InfinityClient {
  embed(texts: string[], prefix?: EmbeddingPrefix): Promise<Float32Array[]>;
  health(): Promise<boolean>;
}

const DEFAULT_CONFIG: InfinityConfig = {
  baseUrl: "http://localhost:7997",
  model: EMBEDDING_CONFIG.model,
  batchSize: 128,
  timeoutMs: 30000,
};

export function createInfinityClient(config: Partial<InfinityConfig> = {}): InfinityClient {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };

  return {
    async embed(
      texts: string[],
      prefix: EmbeddingPrefix = "search_document"
    ): Promise<Float32Array[]> {
      if (texts.length === 0) return [];

      const prefixStr =
        prefix === "search_query" ? EMBEDDING_CONFIG.queryPrefix : EMBEDDING_CONFIG.documentPrefix;

      const prefixedTexts = texts.map((t) => `${prefixStr}${t}`);

      const response = await fetch(`${finalConfig.baseUrl}/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: prefixedTexts,
          model: finalConfig.model,
        }),
        signal: AbortSignal.timeout(finalConfig.timeoutMs),
      });

      if (!response.ok) {
        throw new Error(`Infinity API error: ${response.status}`);
      }

      const data = (await response.json()) as {
        data: { embedding: number[]; index: number }[];
      };

      const sorted = [...data.data].sort((a, b) => a.index - b.index);

      return sorted.map((item) => new Float32Array(item.embedding));
    },

    async health(): Promise<boolean> {
      try {
        const response = await fetch(`${finalConfig.baseUrl}/health`, {
          method: "GET",
          signal: AbortSignal.timeout(5000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
