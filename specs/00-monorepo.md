# anime-rag — Monorepo Specification

## Overview

An open-source anime metadata dataset optimized for RAG applications, distributed as pre-built artifacts consumed by an MCP server. The system enriches [manami-project/anime-offline-database](https://github.com/manami-project/anime-offline-database) with LLM-synthesized synopses, normalized taxonomy, and semantic embeddings.

## Tech Stack

| Concern | Choice | Rationale |
|---------|--------|-----------|
| Runtime | **Bun** | Built-in SQLite, fast I/O, near-instant startup for MCP server cold start |
| Language | **TypeScript** (exclusively) | Single type system from raw provider responses through MCP tool return types |
| Linter/Formatter | **Biome** | Rust-based, instant, replaces ESLint + Prettier |
| Embedding Inference | **Infinity** (existing deployment) | Already running, optimized for batch inference, OpenAI-compatible REST API |
| Embedding Model | **Nomic Embed v1.5** (768d) | Matryoshka support, task prefixes, Apache 2.0, CPU-friendly |
| LLM (synopsis synthesis) | **Remote API** (Anthropic/OpenAI via TS SDKs) | Generous existing rate limits, Stainless-generated TS SDKs are source of truth |
| Database | **bun:sqlite** | Zero-dependency, fast, used for both intermediate state and final artifact |
| Parquet | **DuckDB CLI** | Shell exec from Bun for artifact assembly |
| Fetch (optional) | **Cloudflare Workers** | Runtime-agnostic fetcher code, free tier sufficient |

## Repository Structure

```
anime-rag/
├── packages/
│   ├── core/              # Shared types, schemas, constants
│   ├── ingest/            # Provider fetchers (AniList, Kitsu)
│   ├── reconcile/         # Manami diffing, ID mapping
│   ├── enrich/            # Taxonomy normalization, LLM synopsis synthesis
│   ├── embed/             # Infinity client, vector operations
│   ├── build/             # SQLite + parquet artifact assembly
│   ├── orchestrator/      # Pipeline state machine, job runner
│   └── mcp-server/        # Consumer-facing MCP tools
├── data/                  # .gitignored — local working data
│   ├── raw/               # Fetched provider responses
│   ├── intermediate/      # Pipeline state DB
│   └── artifacts/         # Built SQLite + parquet
├── bunfig.toml
├── biome.json
├── package.json
└── tsconfig.base.json
```

## Architecture Tiers

The system is organized into 8 tiers with clear data flow boundaries.

**Tier 1 — Ingest.** Fetchers per provider with rate limiting, retry logic, response normalization. Stateless — takes anime ID + provider, returns raw data. Runs in Cloudflare Workers or local Bun.

**Tier 2 — Reconciliation.** Consumes manami weekly releases. Diffs against previous version. Maps entries to provider IDs. Determines fetch/re-fetch/unchanged work.

**Tier 3 — Enrichment.** Taxonomy normalization via deterministic lookup tables. Synopsis synthesis via remote LLM (3+ source synopses → original merged text). Canonical embedding text generation via templating.

**Tier 4 — Embedding.** Batch processing of canonical text through Infinity server. Outputs 768d vectors keyed by anime ID. Matryoshka truncation available.

**Tier 5 — Build.** Assembles final distribution artifacts: SQLite with FTS5, parquet for embeddings, JSON/JSONL for metadata. Versioned and checksummed.

**Tier 6 — Distribution.** GitHub Releases for artifacts. HuggingFace mirror. npm package for MCP server. Weekly updates with auto-notification.

**Tier 7 — MCP Server.** Consumer-facing product. Loads pre-built artifacts. Exposes search, recommend, browse tools. Hybrid FTS + vector search.

**Tier 8 — Orchestration.** Ties tiers 1–6 together. State machine per anime entry, retry/resume logic, intermediate state DB. Manages dependency graph: fetch → reconcile → enrich → embed → build → release.

## Data Flow

```
AniList  ─┐
Kitsu    ─┤─→ raw JSON ─→ reconcile ─→ enrich ─→ embed ─→ build ─→ release
(AniDB)  ─┘     (staged)   (diffing)   (LLM +    (Infinity)  (SQLite +
                                        taxonomy)              parquet)
                                                                  │
                                                                  ▼
                                                           MCP Server
                                                         (consumer product)
```

## Artifact Boundary

The clean interface between pipeline and server is the built artifact set:

| Artifact | Format | Contents |
|----------|--------|----------|
| `anime-rag.sqlite` | SQLite + FTS5 | Metadata, normalized taxonomy, synthesized synopses, FTS virtual table |
| `embeddings.parquet` | Parquet | 768d vectors keyed by anime source URI |
| `metadata.jsonl` | JSON Lines | Full metadata export for programmatic consumers |

The MCP server only reads these artifacts. It never calls provider APIs, runs LLMs, or generates embeddings.

## Data Sources

| Source | Synopsis? | Access | Request Count (30k) | Role |
|--------|----------|--------|---------------------|------|
| **AniList** | Yes | GraphQL, 30 req/min (degraded) | ~600 paginated | Primary |
| **Kitsu** | Yes | JSON:API, 20/page | ~1,500 | Primary |
| Jikan/MAL | Yes | Self-hosted scraper | ~30k (per-entry) | Optional/risky |
| AniDB dump | Titles only | Daily XML | 0 | ID cross-reference |
| TVDB | Yes | Licensed API key | N/A | Excluded (cost + non-anime-native) |

Realistic total: **~2,100 API requests** for initial corpus via AniList + Kitsu.

## Pipeline Cadence

**Initial load (~1 week buffer, ~1–2 days actual work):** AniList batch fetch completes in under 30 minutes even at degraded rates. Kitsu completes within a day. LLM synthesis: 17–25 hours wall time at 2–3s per entry. Embedding: minutes. Week provides headroom for failures and retries.

**Weekly reconciliation:** Manami releases weekly. Diff yields ~20–50 new/changed entries. Single-digit API calls, minutes of synthesis, seconds of embedding. Entire pipeline completes in minutes.

## Workspace Configuration

Bun workspaces with shared `tsconfig.base.json`. Each package declares its own `package.json` with internal dependencies via `workspace:*` protocol.

```jsonc
// root package.json
{
  "workspaces": ["packages/*"],
  "devDependencies": {
    "@biomejs/biome": "latest"
  }
}
```

```jsonc
// bunfig.toml
[install]
peer = false
```

## Conventions

- All packages use ESM exclusively.
- Shared types flow from `@anime-rag/core` — no duplicated type definitions.
- Provider-specific logic stays in `ingest` — no provider awareness leaks into downstream tiers.
- The orchestrator coordinates via subprocess/function calls, never by importing pipeline internals.
- Intermediate state uses bun:sqlite, not files, for atomicity and query-ability.
- Biome enforces formatting and linting on commit.
