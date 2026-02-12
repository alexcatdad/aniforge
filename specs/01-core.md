# @anime-rag/core — Specification

## Purpose

Shared types, schemas, constants, and utility functions consumed by all other packages. Runtime-agnostic — must work in both Bun and Cloudflare Workers (`workerd`).

## Package Location

```
packages/core/
├── src/
│   ├── types/
│   │   ├── anime.ts           # Canonical anime record
│   │   ├── provider.ts        # Provider-specific raw response types
│   │   ├── embedding.ts       # Vector types and dimensions
│   │   ├── pipeline.ts        # Pipeline state, status enums
│   │   └── mcp.ts             # MCP tool input/output schemas
│   ├── schemas/
│   │   ├── anime.schema.ts    # Zod or runtime validation
│   │   └── taxonomy.schema.ts # Tag/genre/theme validation
│   ├── constants/
│   │   ├── providers.ts       # Provider names, base URLs, ID patterns
│   │   ├── taxonomy.ts        # Normalized tag/genre/theme lookup tables
│   │   └── embedding.ts       # Model name, dimensions, prefixes
│   ├── utils/
│   │   ├── uri.ts             # Source URI parsing and construction
│   │   └── text.ts            # Whitespace normalization, text cleaning
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Key Types

### Anime Record (Canonical)

```typescript
interface AnimeRecord {
  id: string;                          // Internal composite key
  titles: {
    canonical: string;                 // Primary display title
    alternatives: string[];            // All known titles across providers
  };
  type: AnimeType;                     // TV | MOVIE | OVA | ONA | SPECIAL | UNKNOWN
  episodes: number;
  status: AnimeStatus;                 // FINISHED | ONGOING | UPCOMING | UNKNOWN
  season: {
    year: number | null;
    season: SeasonName | null;         // WINTER | SPRING | SUMMER | FALL
  };
  duration: {
    seconds: number;                   // Per-episode duration
    unit: 'per_episode' | 'total';
  } | null;
  sources: SourceURI[];                // manami-provided cross-references
  tags: NormalizedTag[];               // Post-taxonomy-normalization
  synopsis: {
    synthesized: string | null;        // LLM-generated merged synopsis
    sourceCount: number;               // How many provider synopses were available
  };
  thumbnail: string | null;            // URL (not stored, fetched by client)
  canonicalEmbeddingText: string;      // Flattened text representation for embedding
}
```

### Provider Response (Raw)

```typescript
interface ProviderResponse {
  provider: ProviderName;              // 'anilist' | 'kitsu' | 'mal' | 'anidb'
  providerId: string;                  // Provider-specific ID
  fetchedAt: string;                   // ISO 8601
  raw: unknown;                        // Unmodified API response
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
```

### Pipeline State

```typescript
interface PipelineEntry {
  animeId: string;
  manamiVersion: string;               // Which release introduced this entry
  sources: Record<ProviderName, ProviderResponse | null>;
  synopsisInputs: number;              // Count of non-null synopses
  synthesisStatus: PipelineStatus;     // PENDING | COMPLETE | FAILED | INSUFFICIENT
  embeddingStatus: PipelineStatus;
  lastUpdated: string;                 // ISO 8601
}

type PipelineStatus = 'pending' | 'complete' | 'failed' | 'insufficient';
```

## Constants

### Taxonomy Normalization

Deterministic lookup table mapping provider-specific tags to normalized categories. No LLM involvement.

```typescript
const TAXONOMY_MAP: Record<string, NormalizedTag> = {
  // AniList tags → normalized
  'Sci-Fi': { category: 'genre', value: 'science_fiction' },
  'Sci Fi': { category: 'genre', value: 'science_fiction' },
  'Science Fiction': { category: 'genre', value: 'science_fiction' },
  // Kitsu tags → normalized
  'super power': { category: 'theme', value: 'superpowers' },
  'Super Power': { category: 'theme', value: 'superpowers' },
  // ...
};
```

### Embedding Configuration

```typescript
const EMBEDDING_CONFIG = {
  model: 'nomic-ai/nomic-embed-text-v1.5',
  dimensions: 768,
  queryPrefix: 'search_query: ',
  documentPrefix: 'search_document: ',
  matryoshkaDimensions: [64, 128, 256, 512, 768],
} as const;
```

### Provider Configuration

```typescript
const PROVIDERS = {
  anilist: {
    name: 'AniList',
    baseUrl: 'https://graphql.anilist.co',
    uriPattern: /^https:\/\/anilist\.co\/anime\/(\d+)$/,
    rateLimit: { requests: 30, perSeconds: 60 },   // Degraded rate
    batchSize: 50,                                    // GraphQL page size
  },
  kitsu: {
    name: 'Kitsu',
    baseUrl: 'https://kitsu.app/api/edge',
    uriPattern: /^https:\/\/kitsu\.app\/anime\/(\d+)$/,
    rateLimit: { requests: 20, perSeconds: 60 },
    batchSize: 20,                                    // JSON:API page size
  },
} as const;
```

## Constraints

- Zero runtime dependencies beyond TypeScript itself.
- No Node-specific or Bun-specific APIs — must be portable to Workers.
- All exports are pure types, constants, or side-effect-free functions.
- Validation schemas (if any) use a runtime-agnostic library or hand-rolled.

## Consumers

Every other package in the monorepo depends on `@anime-rag/core`. It is the single source of truth for the anime record shape and all shared constants.
