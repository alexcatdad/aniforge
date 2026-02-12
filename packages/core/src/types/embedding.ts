export interface EmbeddingConfig {
  model: string;
  dimensions: number;
  queryPrefix: string;
  documentPrefix: string;
  matryoshkaDimensions: number[];
}

export const EMBEDDING_CONFIG: EmbeddingConfig = {
  model: "nomic-ai/nomic-embed-text-v1.5",
  dimensions: 768,
  queryPrefix: "search_query: ",
  documentPrefix: "search_document: ",
  matryoshkaDimensions: [64, 128, 256, 512, 768],
} as const;

export type EmbeddingPrefix = "search_query" | "search_document";
