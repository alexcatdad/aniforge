import type { ProviderName } from "./anime";
export type { ProviderName };

export interface ProviderResponse {
  provider: ProviderName;
  providerId: string;
  fetchedAt: string;
  raw: unknown;
  extracted: {
    title: string;
    synopsis: string | null;
    tags: string[];
    type: string;
    episodes: number | null;
    status: string;
    year: number | null;
  };
}

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  uriPattern: RegExp;
  rateLimit: { requests: number; perSeconds: number };
  batchSize: number;
}

export const PROVIDERS: Record<ProviderName, ProviderConfig> = {
  anilist: {
    name: "AniList",
    baseUrl: "https://graphql.anilist.co",
    uriPattern: /^https:\/\/anilist\.co\/anime\/(\d+)$/,
    rateLimit: { requests: 30, perSeconds: 60 },
    batchSize: 50,
  },
  kitsu: {
    name: "Kitsu",
    baseUrl: "https://kitsu.app/api/edge",
    uriPattern: /^https:\/\/kitsu\.app\/anime\/(\d+)$/,
    rateLimit: { requests: 20, perSeconds: 60 },
    batchSize: 20,
  },
  mal: {
    name: "MyAnimeList",
    baseUrl: "https://api.myanimelist.net/v2",
    uriPattern: /^https:\/\/myanimelist\.net\/anime\/(\d+)$/,
    rateLimit: { requests: 30, perSeconds: 60 },
    batchSize: 100,
  },
  anidb: {
    name: "AniDB",
    baseUrl: "https://api.anidb.net",
    uriPattern: /^https:\/\/anidb\.net\/anime\/(\d+)$/,
    rateLimit: { requests: 10, perSeconds: 60 },
    batchSize: 50,
  },
} as const;
