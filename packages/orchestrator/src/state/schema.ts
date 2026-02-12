export const STATE_SCHEMA = `
CREATE TABLE IF NOT EXISTS pipeline_state (
  anime_id TEXT PRIMARY KEY,
  manami_version TEXT NOT NULL,
  sources TEXT,
  synopsis_inputs INTEGER DEFAULT 0,
  fetch_status TEXT DEFAULT 'pending',
  synthesis_status TEXT DEFAULT 'pending',
  embedding_status TEXT DEFAULT 'pending',
  canonical_text TEXT,
  error_log TEXT,
  last_updated TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
  run_id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  manami_version TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  status TEXT DEFAULT 'running',
  stats TEXT
);

CREATE INDEX IF NOT EXISTS idx_state_fetch ON pipeline_state(fetch_status);
CREATE INDEX IF NOT EXISTS idx_state_synthesis ON pipeline_state(synthesis_status);
CREATE INDEX IF NOT EXISTS idx_state_embedding ON pipeline_state(embedding_status);
`;
