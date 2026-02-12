import type { ProviderName, ProviderResponse } from "@anime-rag/core";
import type { RateLimiterConfig } from "../rate-limiter";

export interface FetchPageResult {
  entries: ProviderResponse[];
  nextCursor: string | null;
}

export interface Fetcher {
  provider: ProviderName;
  fetchPage(cursor: string | null): Promise<FetchPageResult>;
  fetchById(id: string): Promise<ProviderResponse | null>;
}

export interface FetcherConfig {
  rateLimit: RateLimiterConfig;
  timeoutMs: number;
}
