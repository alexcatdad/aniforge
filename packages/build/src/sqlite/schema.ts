export const SCHEMA = `
-- Core metadata table
CREATE TABLE IF NOT EXISTS anime (
  id TEXT PRIMARY KEY,
  title_canonical TEXT NOT NULL,
  title_alternatives TEXT,
  type TEXT NOT NULL,
  episodes INTEGER,
  status TEXT,
  season_year INTEGER,
  season_name TEXT,
  duration_seconds INTEGER,
  sources TEXT NOT NULL,
  relations TEXT,
  thumbnail_url TEXT,
  synopsis_synthesized TEXT,
  synopsis_source_count INTEGER,
  canonical_embedding_text TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Normalized taxonomy (many-to-many)
CREATE TABLE IF NOT EXISTS anime_tags (
  anime_id TEXT NOT NULL REFERENCES anime(id),
  category TEXT NOT NULL,
  value TEXT NOT NULL,
  PRIMARY KEY (anime_id, category, value)
);

-- Metadata about the build
CREATE TABLE IF NOT EXISTS build_info (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_anime_type ON anime(type);
CREATE INDEX IF NOT EXISTS idx_anime_status ON anime(status);
CREATE INDEX IF NOT EXISTS idx_anime_year ON anime(season_year);
CREATE INDEX IF NOT EXISTS idx_tags_category ON anime_tags(category, value);
`;

export const FTS_SCHEMA = `
-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS anime_fts USING fts5(
  title_canonical,
  title_alternatives,
  synopsis_synthesized,
  tokenize='porter unicode61'
);
`;

export const FTS_TRIGGERS = `
-- Triggers to keep FTS index in sync
CREATE TRIGGER IF NOT EXISTS anime_ai AFTER INSERT ON anime BEGIN
  INSERT INTO anime_fts(rowid, title_canonical, title_alternatives, synopsis_synthesized)
  VALUES (new.rowid, new.title_canonical, new.title_alternatives, new.synopsis_synthesized);
END;

CREATE TRIGGER IF NOT EXISTS anime_ad AFTER DELETE ON anime BEGIN
  INSERT INTO anime_fts(anime_fts, rowid, title_canonical, title_alternatives, synopsis_synthesized)
  VALUES ('delete', old.rowid, old.title_canonical, old.title_alternatives, old.synopsis_synthesized);
END;

CREATE TRIGGER IF NOT EXISTS anime_au AFTER UPDATE ON anime BEGIN
  INSERT INTO anime_fts(anime_fts, rowid, title_canonical, title_alternatives, synopsis_synthesized)
  VALUES ('delete', old.rowid, old.title_canonical, old.title_alternatives, old.synopsis_synthesized);
  INSERT INTO anime_fts(rowid, title_canonical, title_alternatives, synopsis_synthesized)
  VALUES (new.rowid, new.title_canonical, new.title_alternatives, new.synopsis_synthesized);
END;
`;
