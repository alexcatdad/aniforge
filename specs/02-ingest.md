# @anime-rag/ingest — Specification

## Purpose

Provider-specific fetchers that retrieve raw anime data from external APIs. Each fetcher handles pagination, rate limiting, retry logic, and response normalization. Stateless — takes an anime ID or page cursor, returns structured data.

## Package Location

```
packages/ingest/
├── src/
│   ├── providers/
│   │   ├── anilist.ts         # AniList GraphQL fetcher
│   │   ├── kitsu.ts           # Kitsu JSON:API fetcher
│   │   └── index.ts           # Provider registry
│   ├── rate-limiter.ts        # Token bucket rate limiter
│   ├── retry.ts               # Exponential backoff with jitter
│   ├── fetcher.ts             # Unified fetcher interface
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Dependencies

- `@anime-rag/core` — types, provider config, URI patterns

## Provider Implementations

### AniList

**API:** GraphQL at `https://graphql.anilist.co`

**Rate limit:** 30 requests/minute (degraded from normal 90).

**Batch strategy:** `Page` query with `perPage: 50`. Retrieves title, description, genres, tags, format, status, episodes, season, duration in a single query per page.

**Request count:** ~600 paginated calls for full 30k corpus.

**GraphQL query shape:**

```graphql
query ($page: Int, $perPage: Int) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage currentPage }
    media(type: ANIME) {
      id
      title { romaji english native }
      description(asHtml: false)
      genres
      tags { name rank }
      format          # TV, MOVIE, OVA, ONA, SPECIAL
      status
      episodes
      season
      seasonYear
      duration        # minutes per episode
      siteUrl
    }
  }
}
```

**ID extraction:** From manami source URIs matching `https://anilist.co/anime/{id}`. For bulk initial load, paginate the full catalog instead of per-ID lookups.

### Kitsu

**API:** JSON:API at `https://kitsu.app/api/edge/anime`

**Rate limit:** No published limit. Throttle to 20 requests/minute for politeness.

**Batch strategy:** `page[limit]=20` with `page[offset]` cursor. Retrieves titles, synopsis, genres (via include), subtype, status, episodeCount, startDate.

**Request count:** ~1,500 paginated calls for full 30k corpus.

**Request shape:**

```
GET /api/edge/anime?page[limit]=20&page[offset]=0
    &fields[anime]=titles,synopsis,subtype,status,episodeCount,
                   startDate,endDate,ageRating,posterImage
    &include=genres,categories
```

**ID extraction:** From manami source URIs matching `https://kitsu.app/anime/{id}`. Kitsu uses slug-based URLs but numeric IDs in the API.

## Fetcher Interface

```typescript
interface Fetcher {
  provider: ProviderName;

  /** Fetch a single page of results. Returns extracted data + pagination cursor. */
  fetchPage(cursor: string | null): Promise<{
    entries: ProviderResponse[];
    nextCursor: string | null;
  }>;

  /** Fetch a single entry by provider-specific ID. For incremental updates. */
  fetchById(id: string): Promise<ProviderResponse | null>;
}
```

## Rate Limiter

Token bucket implementation. Configurable per-provider from `PROVIDERS` constants in core.

```typescript
interface RateLimiter {
  acquire(): Promise<void>;   // Blocks until a token is available
  configure(opts: { requests: number; perSeconds: number }): void;
}
```

Must handle:
- Burst avoidance (spread requests evenly, don't front-load).
- HTTP 429 response detection with `Retry-After` header parsing.
- Automatic backoff on 429 — pause and retry after indicated duration.

## Retry Strategy

Exponential backoff with jitter for transient failures (5xx, network errors, timeouts).

- Max retries: 3.
- Base delay: 1 second.
- Jitter: ±500ms randomized.
- Non-retryable: 4xx (except 429), malformed response.

## Output

Each fetcher produces `ProviderResponse` objects (defined in core) with both the raw API response and extracted normalized fields. Raw responses are preserved for debugging and potential re-extraction without re-fetching.

## Runtime Compatibility

Fetcher code is structured as pure async functions using only `fetch()` and standard APIs. Designed to run in:

- **Bun** — primary development and pipeline execution.
- **Cloudflare Workers** (`workerd`) — optional distributed fetch for initial load. The ingest package exports functions, not a server. The Workers adapter is a thin wrapper.

## Error Handling

- Network errors → retry with backoff.
- Rate limit (429) → pause, respect `Retry-After`, resume.
- Provider down (5xx) → retry, then mark entry as `fetch_failed` in pipeline state.
- Missing data (entry not found, no synopsis) → return `ProviderResponse` with `extracted.synopsis: null`. Not an error.
- Malformed response → log, skip, flag for review.

## Operational Estimates

| Metric | AniList | Kitsu | Total |
|--------|---------|-------|-------|
| Initial load requests | ~600 | ~1,500 | ~2,100 |
| Time at rate limit | ~20 min | ~75 min | ~95 min |
| Weekly delta requests | 1–5 | 1–5 | 2–10 |
| Cloudflare Workers free tier | 100k/day | 100k/day | Massive headroom |
