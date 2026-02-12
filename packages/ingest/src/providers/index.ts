import type { ProviderName } from "@anime-rag/core";
import type { Fetcher } from "../fetcher";
import { AniListFetcher } from "./anilist";
import { KitsuFetcher } from "./kitsu";

export { AniListFetcher } from "./anilist";
export { KitsuFetcher } from "./kitsu";

export function createFetcher(provider: ProviderName): Fetcher {
  switch (provider) {
    case "anilist":
      return new AniListFetcher();
    case "kitsu":
      return new KitsuFetcher();
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export const FETCHERS: Record<ProviderName, Fetcher | null> = {
  anilist: null,
  kitsu: null,
  mal: null,
  anidb: null,
};

export function getFetcher(provider: ProviderName): Fetcher {
  if (!FETCHERS[provider]) {
    FETCHERS[provider] = createFetcher(provider);
  }
  return FETCHERS[provider]!;
}
