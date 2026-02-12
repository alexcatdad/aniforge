# @anime-rag/mcp-server — Specification

## Purpose

Consumer-facing MCP server. The actual product. Loads pre-built SQLite and embedding artifacts, exposes search, recommendation, and browse tools to MCP-compatible clients (Claude Desktop, Claude Code, etc.). The client's LLM handles all generation — this server only handles retrieval and scoring.

## Package Location

```
packages/mcp-server/
├── src/
│   ├── tools/
│   │   ├── search.ts          # search_anime tool
│   │   ├── recommend.ts       # recommend_similar tool
│   │   ├── details.ts         # get_anime_details tool
│   │   └── browse.ts          # browse_taxonomy tool
│   ├── search/
│   │   ├── fts.ts             # FTS5 full-text search
│   │   ├── vector.ts          # Vector similarity search
│   │   ├── hybrid.ts          # Reciprocal Rank Fusion
│   │   └── rerank.ts          # Optional cross-encoder reranking
│   ├── recommend/
│   │   ├── engine.ts          # Multi-signal recommendation engine
│   │   ├── taste-centroid.ts  # User taste vector computation
│   │   └── scoring.ts         # Blended signal scoring
│   ├── data/
│   │   ├── loader.ts          # Artifact loading and initialization
│   │   └── cache.ts           # In-memory caches
│   ├── server.ts              # MCP server setup
│   ├── config.ts              # Runtime configuration
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Dependencies

- `@anime-rag/core` — types, embedding config
- `@anime-rag/embed` — Infinity client (for query-time embedding)
- `@modelcontextprotocol/sdk` — MCP TypeScript SDK
- `bun:sqlite` — read pre-built database

## MCP Tools

### `search_anime`

Natural language search over the anime corpus. Hybrid FTS + vector search.

```typescript
interface SearchAnimeInput {
  query: string;                      // Natural language query
  limit?: number;                     // Default: 10, max: 50
  filters?: {
    type?: AnimeType[];               // Filter by type
    status?: AnimeStatus[];           // Filter by status
    yearMin?: number;                 // Filter by year range
    yearMax?: number;
    tags?: string[];                  // Must include these tags
  };
}

interface SearchAnimeOutput {
  results: {
    id: string;
    title: string;
    alternatives: string[];
    type: string;
    episodes: number;
    status: string;
    year: number | null;
    tags: { category: string; value: string }[];
    synopsis: string | null;
    score: number;                    // Relevance score (0-1)
    matchType: 'fts' | 'vector' | 'hybrid';
  }[];
  totalMatches: number;
  searchMode: 'hybrid' | 'fts_only'; // Degrades if Infinity unavailable
}
```

### `recommend_similar`

Given anime titles and optional preferences, find similar anime using semantic similarity and multi-signal scoring.

```typescript
interface RecommendSimilarInput {
  titles: string[];                   // 1-10 anime titles the user likes
  preferences?: string;              // Natural language preferences (e.g., "post-2020", "darker tone")
  excludeTitles?: string[];          // Already seen, don't recommend
  limit?: number;                    // Default: 8, max: 20
}

interface RecommendSimilarOutput {
  recommendations: {
    id: string;
    title: string;
    type: string;
    episodes: number;
    year: number | null;
    tags: { category: string; value: string }[];
    synopsis: string | null;
    similarityScore: number;         // Overall blended score (0-1)
    signals: {
      semantic: number;              // Embedding cosine similarity
      taxonomy: number;              // Tag overlap score
      temporal: number;              // Year proximity score
      format: number;                // Type/episodes similarity
    };
  }[];
  tasteCentroid: string[];           // Top tags from the user's taste profile
}
```

### `get_anime_details`

Full metadata lookup for a specific entry.

```typescript
interface GetAnimeDetailsInput {
  title?: string;                    // Fuzzy title search
  id?: string;                       // Exact ID lookup
}

interface GetAnimeDetailsOutput {
  anime: {
    id: string;
    titles: { canonical: string; alternatives: string[] };
    type: string;
    episodes: number;
    status: string;
    season: { year: number | null; season: string | null };
    duration: number | null;
    sources: string[];               // Provider URLs (MAL, AniList, Kitsu, etc.)
    relations: string[];
    tags: { category: string; value: string }[];
    synopsis: string | null;
  } | null;
}
```

### `browse_taxonomy`

Explore available tags, genres, and themes. Useful for discovery.

```typescript
interface BrowseTaxonomyInput {
  category?: 'genre' | 'theme' | 'demographic' | 'setting';
  search?: string;                   // Fuzzy search within tags
}

interface BrowseTaxonomyOutput {
  categories: {
    category: string;
    tags: {
      value: string;
      count: number;                 // How many anime have this tag
    }[];
  }[];
}
```

## Search Strategy

### Full-Text Search (FTS5)

Primary search method. BM25 ranking over title, alternative titles, synopsis, and tags.

```typescript
function ftsSearch(query: string, limit: number): SearchResult[] {
  // SELECT *, bm25(anime_fts) as rank
  // FROM anime_fts
  // WHERE anime_fts MATCH ?
  // ORDER BY rank
  // LIMIT ?
}
```

Handles exact keywords, title lookups, tag-based queries. Covers 70–80% of real-world queries effectively.

### Vector Search

Semantic fallback for conceptual queries ("anime like mushishi but in space", "melancholy slice of life"). Requires Infinity to be running.

```typescript
async function vectorSearch(query: string, limit: number): Promise<SearchResult[]> {
  // 1. Embed query: "search_query: {query}"
  const queryVec = await embedClient.embed([query], 'search_query');

  // 2. Brute-force cosine similarity against all corpus vectors
  const topK = vectorOps.topK(queryVec[0], corpusVectors, limit * 2);

  // 3. Fetch metadata for top results from SQLite
  return hydrateResults(topK);
}
```

### Hybrid Search (Reciprocal Rank Fusion)

When both FTS and vector search return results, merge using RRF.

```typescript
function reciprocalRankFusion(
  ftsResults: SearchResult[],
  vectorResults: SearchResult[],
  k: number = 60                     // RRF constant
): SearchResult[] {
  // RRF score = Σ 1/(k + rank_i) for each ranking list
  // Merge, deduplicate by anime ID, sort by combined score
}
```

**Degradation:** If Infinity is unavailable, falls back to FTS-only. The server logs a warning on startup and operates without vector search.

## Recommendation Engine

### Taste Centroid

Given the user's liked titles, compute a "taste vector" that represents their preferences in embedding space.

```typescript
function computeTasteCentroid(titles: string[]): Float32Array {
  // 1. Look up each title in the database (fuzzy match)
  // 2. Retrieve pre-computed embeddings for matched entries
  // 3. Compute centroid (mean) of all matched embeddings
  return centroid(matchedVectors);
}
```

### Multi-Signal Scoring

Recommendations are scored by blending multiple signals. Each signal is normalized to [0, 1].

| Signal | Weight | Description |
|--------|--------|-------------|
| Semantic | 0.50 | Cosine similarity between taste centroid and candidate embedding |
| Taxonomy | 0.20 | Jaccard similarity of normalized tag sets |
| Temporal | 0.15 | Year proximity (Gaussian decay, σ=5 years) |
| Format | 0.15 | Type match + episode count similarity |

```typescript
function blendedScore(candidate: AnimeRecord, context: RecommendContext): number {
  return (
    context.weights.semantic * cosineSimilarity(context.tasteCentroid, candidate.vector) +
    context.weights.taxonomy * jaccardSimilarity(context.userTags, candidate.tags) +
    context.weights.temporal * temporalScore(context.preferredYear, candidate.year) +
    context.weights.format * formatScore(context.preferredType, candidate.type, candidate.episodes)
  );
}
```

### Recommendation Flow

1. Compute taste centroid from input titles.
2. Top 50 nearest neighbors by cosine similarity.
3. Re-score with blended multi-signal scoring.
4. Filter out excluded titles.
5. Return top N with scores and signal breakdown.
6. Client LLM generates natural language explanations from the structured results.

## Data Loading

On startup, the server loads:

1. **SQLite database** — opened read-only via `bun:sqlite`. Stays on disk, queries are fast.
2. **Embedding vectors** — loaded from parquet into memory as a `Float32Array[]`. At 30k × 768 × 4 bytes = ~90 MB RAM. Acceptable for a local MCP server.
3. **Infinity health check** — ping the Infinity server. If unavailable, vector search disabled.

```typescript
async function initialize(config: ServerConfig): Promise<ServerState> {
  const db = new Database(config.sqlitePath, { readonly: true });
  const vectors = await loadVectors(config.parquetPath);
  const infinityAvailable = await embedClient.health();

  return { db, vectors, infinityAvailable };
}
```

## Distribution

The MCP server is distributed as an npm package. Users install and configure it for their MCP client.

```bash
# Install
npm install -g @anime-rag/mcp-server

# First run downloads artifacts (~150 MB)
anime-rag-mcp init

# Configure in Claude Desktop
# ~/.config/claude/claude_desktop_config.json
{
  "mcpServers": {
    "anime-rag": {
      "command": "anime-rag-mcp",
      "args": ["serve"]
    }
  }
}
```

### Artifact Management

- First run: download latest release from GitHub Releases.
- `anime-rag-mcp update`: check for and download newer artifacts.
- Artifacts stored in platform-appropriate data directory (`~/.local/share/anime-rag/` on Linux).
- Server checks artifact version on startup, warns if outdated.

## What the Server Does NOT Do

- **No LLM calls.** The client's LLM (Claude, GPT, etc.) handles all generation, explanation, and conversational synthesis.
- **No image hosting or proxying.** Source URIs point to provider pages. The client can fetch posters, ratings, streaming links via its own tools (web search, image search).
- **No authentication.** Local MCP server, no user accounts.
- **No provider API calls.** All data comes from pre-built artifacts.
- **No write operations.** The database and vectors are read-only.

This design keeps the server legally clean (no copyrighted images stored), architecturally simple (read-only data, pure functions), and fast (no network calls during tool execution except optional Infinity query embedding).

## Configuration

```typescript
interface ServerConfig {
  sqlitePath: string;                // Path to anime-rag.sqlite
  parquetPath: string;               // Path to embeddings.parquet
  infinityUrl?: string;              // Default: 'http://localhost:7997'
  port?: number;                     // For stdio MCP, not typically needed
}
```

## Performance Targets

| Operation | Target Latency |
|-----------|---------------|
| FTS search | < 5ms |
| Vector search (30k brute-force) | < 10ms |
| Hybrid search | < 20ms |
| Recommendation (full pipeline) | < 50ms |
| Cold start (load DB + vectors) | < 3 seconds |
