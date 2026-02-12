import { Database } from "bun:sqlite";
import type {
  PipelineStats,
  PipelineStatus,
  ProviderName,
  ProviderResponse,
} from "@anime-rag/core";
import { STATE_SCHEMA } from "./schema";

export interface StateEntry {
  animeId: string;
  manamiVersion: string;
  sources: Record<ProviderName, ProviderResponse | null>;
  synopsisInputs: number;
  fetchStatus: PipelineStatus;
  synthesisStatus: PipelineStatus;
  embeddingStatus: PipelineStatus;
  canonicalText: string | null;
  errorLog: string | null;
  lastUpdated: string;
}

export interface RunEntry {
  runId: string;
  runType: "initial_load" | "weekly_update";
  manamiVersion: string;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "completed" | "failed";
  stats: PipelineStats | null;
}

export function createStateDatabase(path: string): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(STATE_SCHEMA);
  return db;
}

export function getEntry(db: Database, animeId: string): StateEntry | null {
  const query = db.prepare("SELECT * FROM pipeline_state WHERE anime_id = ?");
  const row = query.get(animeId) as Record<string, unknown> | null;

  if (!row) return null;

  return rowToEntry(row);
}

export function getEntriesByStatus(
  db: Database,
  field: "fetch_status" | "synthesis_status" | "embedding_status",
  status: PipelineStatus
): StateEntry[] {
  const query = db.prepare(`SELECT * FROM pipeline_state WHERE ${field} = ?`);
  const rows = query.all(status) as Record<string, unknown>[];

  return rows.map(rowToEntry);
}

export function upsertEntry(db: Database, entry: Partial<StateEntry> & { animeId: string }): void {
  const existing = getEntry(db, entry.animeId);

  if (existing) {
    const update = db.prepare(`
      UPDATE pipeline_state SET
        manami_version = ?,
        sources = ?,
        synopsis_inputs = ?,
        fetch_status = ?,
        synthesis_status = ?,
        embedding_status = ?,
        canonical_text = ?,
        error_log = ?,
        last_updated = datetime('now')
      WHERE anime_id = ?
    `);

    update.run(
      entry.manamiVersion ?? existing.manamiVersion,
      entry.sources !== undefined ? JSON.stringify(entry.sources) : rowGetSources(existing),
      entry.synopsisInputs ?? existing.synopsisInputs,
      entry.fetchStatus ?? existing.fetchStatus,
      entry.synthesisStatus ?? existing.synthesisStatus,
      entry.embeddingStatus ?? existing.embeddingStatus,
      entry.canonicalText ?? existing.canonicalText,
      entry.errorLog ?? existing.errorLog,
      entry.animeId
    );
  } else {
    const insert = db.prepare(`
      INSERT INTO pipeline_state (
        anime_id, manami_version, sources, synopsis_inputs,
        fetch_status, synthesis_status, embedding_status,
        canonical_text, error_log
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insert.run(
      entry.animeId,
      entry.manamiVersion ?? "",
      entry.sources ? JSON.stringify(entry.sources) : null,
      entry.synopsisInputs ?? 0,
      entry.fetchStatus ?? "pending",
      entry.synthesisStatus ?? "pending",
      entry.embeddingStatus ?? "pending",
      entry.canonicalText ?? null,
      entry.errorLog ?? null
    );
  }
}

export function updateStatus(
  db: Database,
  animeId: string,
  field: "fetch_status" | "synthesis_status" | "embedding_status",
  status: PipelineStatus,
  error?: string
): void {
  const update = db.prepare(`
    UPDATE pipeline_state SET ${field} = ?, error_log = ?, last_updated = datetime('now')
    WHERE anime_id = ?
  `);

  update.run(status, error ?? null, animeId);
}

export function createRun(
  db: Database,
  runId: string,
  runType: "initial_load" | "weekly_update",
  manamiVersion: string
): void {
  const insert = db.prepare(`
    INSERT INTO pipeline_runs (run_id, run_type, manami_version, started_at, status)
    VALUES (?, ?, ?, datetime('now'), 'running')
  `);

  insert.run(runId, runType, manamiVersion);
}

export function completeRun(
  db: Database,
  runId: string,
  stats: PipelineStats,
  status: "completed" | "failed" = "completed"
): void {
  const update = db.prepare(`
    UPDATE pipeline_runs SET
      completed_at = datetime('now'),
      status = ?,
      stats = ?
    WHERE run_id = ?
  `);

  update.run(status, JSON.stringify(stats), runId);
}

export function getLastRun(db: Database): RunEntry | null {
  const query = db.prepare(`
    SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 1
  `);
  const row = query.get() as Record<string, unknown> | null;

  if (!row) return null;

  return {
    runId: row.run_id as string,
    runType: row.run_type as "initial_load" | "weekly_update",
    manamiVersion: row.manami_version as string,
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | null,
    status: row.status as "running" | "completed" | "failed",
    stats: row.stats ? JSON.parse(row.stats as string) : null,
  };
}

export function getIncompleteRun(db: Database): RunEntry | null {
  const query = db.prepare(`
    SELECT * FROM pipeline_runs WHERE status = 'running' LIMIT 1
  `);
  const row = query.get() as Record<string, unknown> | null;

  if (!row) return null;

  return {
    runId: row.run_id as string,
    runType: row.run_type as "initial_load" | "weekly_update",
    manamiVersion: row.manami_version as string,
    startedAt: row.started_at as string,
    completedAt: row.completed_at as string | null,
    status: row.status as "running" | "completed" | "failed",
    stats: row.stats ? JSON.parse(row.stats as string) : null,
  };
}

function rowToEntry(row: Record<string, unknown>): StateEntry {
  return {
    animeId: row.anime_id as string,
    manamiVersion: row.manami_version as string,
    sources: row.sources ? JSON.parse(row.sources as string) : {},
    synopsisInputs: row.synopsis_inputs as number,
    fetchStatus: row.fetch_status as PipelineStatus,
    synthesisStatus: row.synthesis_status as PipelineStatus,
    embeddingStatus: row.embedding_status as PipelineStatus,
    canonicalText: row.canonical_text as string | null,
    errorLog: row.error_log as string | null,
    lastUpdated: row.last_updated as string,
  };
}

function rowGetSources(entry: StateEntry): string {
  const sources: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry.sources)) {
    sources[k] = v;
  }
  return JSON.stringify(sources);
}
