# @anime-rag/build — Specification

## Purpose

Assembles final distribution artifacts from enriched data and embeddings. Produces the versioned, checksummed files that the MCP server consumes and that get published to GitHub Releases and HuggingFace.

## Package Location

```
packages/build/
├── src/
│   ├── sqlite/
│   │   ├── builder.ts         # SQLite database assembly
│   │   ├── schema.sql         # DDL for the final database
│   │   └── fts.ts             # FTS5 virtual table setup
│   ├── parquet/
│   │   ├── writer.ts          # DuckDB CLI wrapper for parquet
│   │   └── schema.ts          # Parquet schema definition
│   ├── metadata/
│   │   └── jsonl.ts           # JSONL export
│   ├── release.ts             # Version tagging, checksums
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Dependencies

- `@anime-rag/core` — types, schemas
- `bun:sqlite` — direct SQLite construction
- DuckDB CLI — shell exec for parquet generation

## Output Artifacts

### 1. `anime-rag.sqlite`

The primary artifact. Contains all metadata, normalized taxonomy, synthesized synopses, and an FTS5 virtual table for full-text search.

**Schema:**

```sql
-- Core metadata table
CREATE TABLE anime (
  id TEXT PRIMARY KEY,
  title_canonical TEXT NOT NULL,
  title_alternatives TEXT,            -- JSON array
  type TEXT NOT NULL,                 -- TV, MOVIE, OVA, ONA, SPECIAL, UNKNOWN
  episodes INTEGER,
  status TEXT,                        -- FINISHED, ONGOING, UPCOMING, UNKNOWN
  season_year INTEGER,
  season_name TEXT,                   -- WINTER, SPRING, SUMMER, FALL
  duration_seconds INTEGER,
  sources TEXT NOT NULL,              -- JSON array of source URIs
  relations TEXT,                     -- JSON array of related source URIs
  thumbnail_url TEXT,
  synopsis_synthesized TEXT,
  synopsis_source_count INTEGER,
  canonical_embedding_text TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Normalized taxonomy (many-to-many)
CREATE TABLE anime_tags (
  anime_id TEXT NOT NULL REFERENCES anime(id),
  category TEXT NOT NULL,             -- genre, theme, demographic, setting, unmapped
  value TEXT NOT NULL,
  PRIMARY KEY (anime_id, category, value)
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE anime_fts USING fts5(
  title_canonical,
  title_alternatives,
  synopsis_synthesized,
  tags,                               -- Flattened tag values for FTS
  content=anime,
  content_rowid=rowid,
  tokenize='porter unicode61'
);

-- Metadata about the build
CREATE TABLE build_info (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- Keys: version, manami_version, build_date, entry_count, embedding_model, embedding_dimensions

-- Index for common queries
CREATE INDEX idx_anime_type ON anime(type);
CREATE INDEX idx_anime_status ON anime(status);
CREATE INDEX idx_anime_year ON anime(season_year);
CREATE INDEX idx_tags_category ON anime_tags(category, value);
```

**FTS5 Configuration:** Porter stemming + unicode61 tokenizer. Supports prefix queries, phrase matching, and BM25 ranking out of the box.

### 2. `embeddings.parquet`

Separate from the SQLite database. Different update cadence, different consumers.

**Schema:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | STRING | Anime ID (joins to `anime.id`) |
| `embedding_768` | FLOAT[768] | Full-dimension Nomic v1.5 vector |
| `embedding_256` | FLOAT[256] | Matryoshka-truncated for lightweight use |

**Generation:** DuckDB CLI reads vectors from a temporary CSV/JSON staging file and writes parquet with Snappy compression.

```typescript
async function buildParquet(
  vectors: Map<string, Float32Array>,
  outputPath: string
): Promise<void> {
  // 1. Write vectors to temp NDJSON file
  // 2. Shell exec DuckDB:
  //    duckdb -c "COPY (SELECT * FROM read_ndjson('temp.ndjson')) TO '${outputPath}' (FORMAT PARQUET, COMPRESSION SNAPPY)"
  // 3. Clean up temp file
}
```

### 3. `metadata.jsonl`

JSON Lines export of all `AnimeRecord` objects. For programmatic consumers who don't want SQLite.

One line per entry, gzipped for distribution:

```jsonl
{"id":"...","titles":{"canonical":"Fullmetal Alchemist: Brotherhood",...},"type":"TV","episodes":64,...}
{"id":"...","titles":{"canonical":"Steins;Gate",...},"type":"TV","episodes":24,...}
```

## Build Process

```typescript
async function buildAll(
  records: AnimeRecord[],
  vectors: Map<string, Float32Array>,
  version: string,
  outputDir: string
): Promise<BuildManifest> {
  // 1. Build SQLite
  const sqlitePath = await buildSqlite(records, path.join(outputDir, 'anime-rag.sqlite'));

  // 2. Build parquet
  const parquetPath = await buildParquet(vectors, path.join(outputDir, 'embeddings.parquet'));

  // 3. Build JSONL
  const jsonlPath = await buildJsonl(records, path.join(outputDir, 'metadata.jsonl.gz'));

  // 4. Generate checksums
  const manifest = await generateManifest(version, [sqlitePath, parquetPath, jsonlPath]);

  return manifest;
}
```

## Build Manifest

```typescript
interface BuildManifest {
  version: string;                    // Semantic version or date-based
  manamiVersion: string;              // lastUpdate from manami release
  buildDate: string;                  // ISO 8601
  embeddingModel: string;             // 'nomic-ai/nomic-embed-text-v1.5'
  embeddingDimensions: number;        // 768
  entryCount: number;
  artifacts: {
    filename: string;
    size: number;                     // bytes
    sha256: string;
  }[];
}
```

Written as `manifest.json` alongside the artifacts.

## Size Estimates

| Artifact | Estimated Size |
|----------|---------------|
| `anime-rag.sqlite` | ~50–80 MB (with FTS5 index) |
| `embeddings.parquet` | ~90 MB (30k × 768 × 4 bytes, Snappy compressed) |
| `metadata.jsonl.gz` | ~15–25 MB |
| Total release | ~155–195 MB |

Within GitHub Releases file size limits (2 GB per file). HuggingFace has no practical limit.

## Rebuild Strategy

**Full rebuild:** Drop and recreate all tables. Used for initial build and when schema changes.

**Incremental update:** For weekly deltas. Insert/update only changed entries. Rebuild FTS5 index (FTS5 supports incremental updates via triggers, but a full rebuild is simpler and fast at this scale).

## Distribution Targets

The build package produces artifacts. Distribution is handled by the orchestrator:

- **GitHub Releases** — tagged release with all artifacts attached.
- **HuggingFace Datasets** — mirror for the ML community.
- **npm** — MCP server package includes a post-install script that downloads artifacts on first run.

## Error Handling

- SQLite write failure → fatal, abort build.
- DuckDB CLI not found → fatal with clear error message ("install DuckDB CLI").
- Checksum mismatch on verification → abort, do not publish.
- Insufficient entries (< 25,000) → warning, build proceeds but flagged.
