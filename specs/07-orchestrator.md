# @anime-rag/orchestrator — Specification

## Purpose

Ties all pipeline tiers together. Manages the state machine for each anime entry, coordinates the dependency graph between stages, handles retry/resume logic, and drives both initial load and weekly update pipelines.

## Package Location

```
packages/orchestrator/
├── src/
│   ├── state/
│   │   ├── db.ts             # Intermediate state DB (bun:sqlite)
│   │   ├── schema.sql        # State DB DDL
│   │   └── queries.ts        # Typed query helpers
│   ├── pipeline/
│   │   ├── initial-load.ts   # Full corpus pipeline
│   │   ├── weekly-update.ts  # Incremental delta pipeline
│   │   └── stages.ts         # Stage definitions and dependency graph
│   ├── cli.ts                # CLI entry point
│   ├── config.ts             # Runtime configuration
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Dependencies

- `@anime-rag/core` — types, constants
- `@anime-rag/ingest` — provider fetchers
- `@anime-rag/reconcile` — manami diffing, work planning
- `@anime-rag/enrich` — taxonomy, synthesis, canonical text
- `@anime-rag/embed` — Infinity client
- `@anime-rag/build` — artifact assembly
- `bun:sqlite` — intermediate state database

## Intermediate State Database

Tracks per-entry progress across all pipeline stages. Enables resume from any failure point.

```sql
CREATE TABLE pipeline_state (
  anime_id TEXT PRIMARY KEY,
  manami_version TEXT NOT NULL,
  sources TEXT,                       -- JSON: raw fetched data per provider
  synopsis_inputs INTEGER DEFAULT 0,  -- count of available synopses
  fetch_status TEXT DEFAULT 'pending',
  synthesis_status TEXT DEFAULT 'pending',
  embedding_status TEXT DEFAULT 'pending',
  canonical_text TEXT,                -- generated embedding text
  error_log TEXT,                     -- last error message if failed
  last_updated TEXT DEFAULT (datetime('now'))
);

-- Status values: pending, in_progress, complete, failed, insufficient

CREATE TABLE pipeline_runs (
  run_id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,             -- 'initial_load' | 'weekly_update'
  manami_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT DEFAULT 'running',      -- running, completed, failed
  stats TEXT                          -- JSON: counts per stage
);

CREATE INDEX idx_state_fetch ON pipeline_state(fetch_status);
CREATE INDEX idx_state_synthesis ON pipeline_state(synthesis_status);
CREATE INDEX idx_state_embedding ON pipeline_state(embedding_status);
```

## Pipeline Stages

Dependency graph — each stage only runs on entries that completed the prerequisite.

```
fetch → synthesize → embed → (build is global, not per-entry)
          ↑
     reconcile (determines which entries need work)
```

```typescript
interface Stage {
  name: string;
  prerequisite: string | null;        // Previous stage that must be 'complete'
  statusField: keyof PipelineEntry;   // Field to update in state DB
  process(entries: PipelineEntry[]): AsyncGenerator<StageResult>;
}

interface StageResult {
  animeId: string;
  status: 'complete' | 'failed' | 'insufficient';
  data?: unknown;                     // Stage-specific output
  error?: string;
}
```

### Stage: Fetch

Processes entries with `fetch_status: 'pending'`. Calls ingest fetchers for each provider. Writes raw responses to state DB `sources` column.

**Concurrency:** Bounded by provider rate limits. AniList and Kitsu fetched in parallel (different rate limit pools).

### Stage: Synthesize

Processes entries with `fetch_status: 'complete'` and `synthesis_status: 'pending'`. Calls enrich synthesizer. Writes canonical text to state DB.

**Concurrency:** Limited by LLM API rate. Sequential or low concurrency to stay within limits.

### Stage: Embed

Processes entries with `synthesis_status: 'complete'` and `embedding_status: 'pending'`. Calls embed client with canonical texts in batches.

**Concurrency:** Single batch pipeline. Infinity handles internal parallelism.

### Stage: Build

Global stage — runs after all entries have been processed (or have reached terminal states). Reads all `complete` entries from state DB, builds artifacts.

## Initial Load Pipeline

```typescript
async function initialLoad(config: OrchestratorConfig): Promise<void> {
  const run = createRun('initial_load');

  // 1. Download manami release
  const manami = await downloadManami();

  // 2. Seed state DB with all entries
  await seedStateDb(manami.data);

  // 3. Fetch stage — paginate all providers
  await runStage('fetch', {
    providers: ['anilist', 'kitsu'],
    mode: 'bulk_paginate',        // Use pagination, not per-ID lookups
  });

  // 4. Synthesize stage — LLM calls
  await runStage('synthesize', {
    batchSize: 10,
    concurrency: 2,
  });

  // 5. Embed stage — Infinity batch
  await runStage('embed', {
    batchSize: 128,
  });

  // 6. Build artifacts
  await runBuild(run);

  // 7. Complete
  await completeRun(run);
}
```

**Expected duration:** 1–2 days actual work, 1 week buffer.

## Weekly Update Pipeline

```typescript
async function weeklyUpdate(config: OrchestratorConfig): Promise<void> {
  const run = createRun('weekly_update');

  // 1. Download latest manami release
  const manami = await downloadManami();

  // 2. Load previous manami version from state DB
  const previousVersion = await getPreviousVersion();

  // 3. Diff
  const changeset = diff(previousVersion, manami);

  // 4. Plan work
  const plan = planWork(changeset, await getStateDb());

  // 5. Fetch only new/changed entries
  await runStage('fetch', {
    providers: ['anilist', 'kitsu'],
    mode: 'by_id',               // Fetch specific IDs, not bulk
    ids: plan.toFetch,
  });

  // 6. Synthesize only new/changed entries
  await runStage('synthesize', {
    ids: plan.toSynthesize,
  });

  // 7. Embed only new/changed entries
  await runStage('embed', {
    ids: plan.toEmbed,
  });

  // 8. Rebuild artifacts (full rebuild, fast at this scale)
  await runBuild(run);

  // 9. Complete
  await completeRun(run);
}
```

**Expected duration:** minutes.

## Resume Logic

If a pipeline run is interrupted (process killed, network failure, LLM outage), the next invocation detects the incomplete run and resumes from where it left off.

```typescript
async function resume(): Promise<void> {
  const lastRun = await getLastIncompleteRun();
  if (!lastRun) {
    console.log('No incomplete run to resume');
    return;
  }

  // Each stage queries for entries in its prerequisite state
  // that haven't been processed yet. Naturally picks up where it stopped.
  await runStage('fetch', { resumeMode: true });
  await runStage('synthesize', { resumeMode: true });
  await runStage('embed', { resumeMode: true });
  await runBuild(lastRun);
  await completeRun(lastRun);
}
```

The state DB makes this trivial — each entry's status tracks exactly where it stopped.

## CLI

```
anime-rag pipeline initial-load       # Full corpus build
anime-rag pipeline weekly-update      # Incremental update
anime-rag pipeline resume             # Resume interrupted run
anime-rag pipeline status             # Show current pipeline state
anime-rag pipeline reset [--stage]    # Reset entries for re-processing
```

## Configuration

```typescript
interface OrchestratorConfig {
  // State DB
  stateDbPath: string;                // Default: './data/intermediate/state.sqlite'

  // Provider credentials (if any)
  anilistRateLimit: number;           // Override for degraded API

  // LLM
  llmProvider: 'anthropic' | 'openai';
  llmModel: string;
  llmApiKey: string;                  // Via environment variable

  // Infinity
  infinityUrl: string;                // Default: 'http://localhost:7997'

  // Build output
  outputDir: string;                  // Default: './data/artifacts'

  // Manami
  manamiUrl: string;                  // Override for testing
}
```

All config via environment variables with sensible defaults. No config file required for basic operation.

## Error Handling

- Stage failure on individual entry → mark entry as `failed`, continue processing other entries.
- Stage failure on batch (e.g., Infinity down) → halt stage, log error, leave entries in `pending`. Resume picks up.
- Run failure → mark run as `failed`. Next invocation can resume or start fresh.
- State DB corruption → fatal. Backup state DB before each run.

## Observability

- Per-stage progress logged to stdout: `[fetch] 1234/30000 (4.1%) — AniList 600/600, Kitsu 634/1500`
- Run stats persisted in `pipeline_runs` table for historical tracking.
- Failed entries queryable: `SELECT * FROM pipeline_state WHERE synthesis_status = 'failed'`
