import type { ProviderName, ProviderResponse } from "@anime-rag/core";
import { PROVIDERS } from "@anime-rag/core";
import type { FetchPageResult, Fetcher, FetcherConfig } from "../fetcher";
import { RateLimiter } from "../rate-limiter";
import { parseRetryAfter, withRetry } from "../retry";

const ANILIST_QUERY = `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage currentPage }
      media(type: ANIME) {
        id
        title { romaji english native }
        description(asHtml: false)
        genres
        tags { name rank }
        format
        status
        episodes
        season
        seasonYear
        duration
        siteUrl
      }
    }
  }
`;

interface AniListMedia {
  id: number;
  title: { romaji: string | null; english: string | null; native: string | null };
  description: string | null;
  genres: string[];
  tags: { name: string; rank: number }[];
  format: string | null;
  status: string | null;
  episodes: number | null;
  season: string | null;
  seasonYear: number | null;
  duration: number | null;
  siteUrl: string;
}

interface AniListResponse {
  data: {
    Page: {
      pageInfo: { hasNextPage: boolean; currentPage: number };
      media: AniListMedia[];
    };
  };
}

function mapFormat(format: string | null): string {
  const formatMap: Record<string, string> = {
    TV: "TV",
    TV_SHORT: "TV",
    MOVIE: "MOVIE",
    OVA: "OVA",
    ONA: "ONA",
    SPECIAL: "SPECIAL",
    MUSIC: "SPECIAL",
  };
  return formatMap[format ?? ""] ?? "UNKNOWN";
}

function mapStatus(status: string | null): string {
  const statusMap: Record<string, string> = {
    FINISHED: "FINISHED",
    RELEASING: "ONGOING",
    NOT_YET_RELEASED: "UPCOMING",
    CANCELLED: "UNKNOWN",
  };
  return statusMap[status ?? ""] ?? "UNKNOWN";
}

export class AniListFetcher implements Fetcher {
  readonly provider: ProviderName = "anilist";
  private readonly rateLimiter: RateLimiter;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: Partial<FetcherConfig> = {}) {
    const providerConfig = PROVIDERS.anilist;
    this.baseUrl = providerConfig.baseUrl;
    this.rateLimiter = new RateLimiter(config.rateLimit ?? providerConfig.rateLimit);
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  async fetchPage(cursor: string | null): Promise<FetchPageResult> {
    const page = cursor ? Number.parseInt(cursor, 10) + 1 : 1;

    const response = await withRetry(async () => {
      await this.rateLimiter.acquire();

      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: ANILIST_QUERY,
          variables: { page, perPage: 50 },
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get("Retry-After"));
        await new Promise((r) => setTimeout(r, retryAfter || 60000));
        throw new Error("Rate limited");
      }

      if (!res.ok) {
        throw new Error(`AniList API error: ${res.status}`);
      }

      return res.json() as Promise<AniListResponse>;
    });

    const media = response.data.Page.media;
    const hasNextPage = response.data.Page.pageInfo.hasNextPage;

    const entries: ProviderResponse[] = media.map((m) => this.mapToProviderResponse(m));

    return {
      entries,
      nextCursor: hasNextPage ? String(page) : null,
    };
  }

  async fetchById(id: string): Promise<ProviderResponse | null> {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          id
          title { romaji english native }
          description(asHtml: false)
          genres
          tags { name rank }
          format
          status
          episodes
          season
          seasonYear
          duration
          siteUrl
        }
      }
    `;

    const response = await withRetry(async () => {
      await this.rateLimiter.acquire();

      const res = await fetch(this.baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { id: Number.parseInt(id, 10) } }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 404) return null;
      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get("Retry-After"));
        await new Promise((r) => setTimeout(r, retryAfter || 60000));
        throw new Error("Rate limited");
      }

      if (!res.ok) {
        throw new Error(`AniList API error: ${res.status}`);
      }

      return res.json() as Promise<{ data: { Media: AniListMedia | null } }>;
    });

    if (!response?.data.Media) return null;
    return this.mapToProviderResponse(response.data.Media);
  }

  private mapToProviderResponse(media: AniListMedia): ProviderResponse {
    const tags = [...media.genres, ...media.tags.filter((t) => t.rank >= 50).map((t) => t.name)];

    const title = media.title.english ?? media.title.romaji ?? media.title.native ?? "Unknown";

    return {
      provider: "anilist",
      providerId: String(media.id),
      fetchedAt: new Date().toISOString(),
      raw: media,
      extracted: {
        title,
        synopsis: media.description ? media.description.trim() : null,
        tags,
        type: mapFormat(media.format),
        episodes: media.episodes,
        status: mapStatus(media.status),
        year: media.seasonYear,
      },
    };
  }
}
