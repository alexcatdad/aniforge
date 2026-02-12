import type { ProviderName, ProviderResponse } from "@anime-rag/core";
import { PROVIDERS } from "@anime-rag/core";
import type { FetchPageResult, Fetcher, FetcherConfig } from "../fetcher";
import { RateLimiter } from "../rate-limiter";
import { parseRetryAfter, withRetry } from "../retry";

interface KitsuAnime {
  id: string;
  attributes: {
    titles: { en: string | null; en_jp: string | null; ja_jp: string | null };
    synopsis: string | null;
    subtype: string | null;
    status: string | null;
    episodeCount: number | null;
    startDate: string | null;
    posterImage: { original: string } | null;
  };
}

interface KitsuResponse {
  data: KitsuAnime[];
  links: { next: string | null };
}

function mapSubtype(subtype: string | null): string {
  const subtypeMap: Record<string, string> = {
    TV: "TV",
    movie: "MOVIE",
    OVA: "OVA",
    ONA: "ONA",
    special: "SPECIAL",
    music: "SPECIAL",
  };
  return subtypeMap[subtype ?? ""] ?? "UNKNOWN";
}

function mapStatus(status: string | null): string {
  const statusMap: Record<string, string> = {
    finished: "FINISHED",
    current: "ONGOING",
    unreleased: "UPCOMING",
    tba: "UPCOMING",
  };
  return statusMap[status ?? ""] ?? "UNKNOWN";
}

export class KitsuFetcher implements Fetcher {
  readonly provider: ProviderName = "kitsu";
  private readonly rateLimiter: RateLimiter;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: Partial<FetcherConfig> = {}) {
    const providerConfig = PROVIDERS.kitsu;
    this.baseUrl = providerConfig.baseUrl;
    this.rateLimiter = new RateLimiter(config.rateLimit ?? providerConfig.rateLimit);
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  async fetchPage(cursor: string | null): Promise<FetchPageResult> {
    const offset = cursor ? Number.parseInt(cursor, 10) : 0;
    const url = `${this.baseUrl}/anime?page[limit]=20&page[offset]=${offset}&fields[anime]=titles,synopsis,subtype,status,episodeCount,startDate,posterImage`;

    const response = await withRetry(async () => {
      await this.rateLimiter.acquire();

      const res = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get("Retry-After"));
        await new Promise((r) => setTimeout(r, retryAfter || 60000));
        throw new Error("Rate limited");
      }

      if (!res.ok) {
        throw new Error(`Kitsu API error: ${res.status}`);
      }

      return res.json() as Promise<KitsuResponse>;
    });

    const entries: ProviderResponse[] = response.data.map((a) => this.mapToProviderResponse(a));
    const nextOffset = response.links.next ? String(offset + 20) : null;

    return {
      entries,
      nextCursor: nextOffset,
    };
  }

  async fetchById(id: string): Promise<ProviderResponse | null> {
    const url = `${this.baseUrl}/anime/${id}?fields[anime]=titles,synopsis,subtype,status,episodeCount,startDate,posterImage`;

    const response = await withRetry(async () => {
      await this.rateLimiter.acquire();

      const res = await fetch(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (res.status === 404) return null;
      if (res.status === 429) {
        const retryAfter = parseRetryAfter(res.headers.get("Retry-After"));
        await new Promise((r) => setTimeout(r, retryAfter || 60000));
        throw new Error("Rate limited");
      }

      if (!res.ok) {
        throw new Error(`Kitsu API error: ${res.status}`);
      }

      return res.json() as Promise<{ data: KitsuAnime }>;
    });

    if (!response) return null;
    return this.mapToProviderResponse(response.data);
  }

  private mapToProviderResponse(anime: KitsuAnime): ProviderResponse {
    const attrs = anime.attributes;
    const title = attrs.titles.en ?? attrs.titles.en_jp ?? attrs.titles.ja_jp ?? "Unknown";

    let year: number | null = null;
    if (attrs.startDate) {
      year = new Date(attrs.startDate).getFullYear();
    }

    return {
      provider: "kitsu",
      providerId: anime.id,
      fetchedAt: new Date().toISOString(),
      raw: anime,
      extracted: {
        title,
        synopsis: attrs.synopsis ? attrs.synopsis.trim() : null,
        tags: [],
        type: mapSubtype(attrs.subtype),
        episodes: attrs.episodeCount,
        status: mapStatus(attrs.status),
        year,
      },
    };
  }
}
