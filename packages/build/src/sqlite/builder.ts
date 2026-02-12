import { Database } from "bun:sqlite";
import { FTS_SCHEMA, FTS_TRIGGERS, SCHEMA } from "./schema";

type NormalizedTag = {
  category: "genre" | "theme" | "demographic" | "setting" | "unmapped";
  value: string;
};

export type AnimeRecord = {
  id: string;
  titles: { canonical: string; alternatives: string[] };
  type: string;
  episodes: number;
  status: string;
  season: { year: number | null; season: string | null };
  duration: { seconds: number; unit: "per_episode" | "total" } | null;
  sources: string[];
  tags: NormalizedTag[];
  synopsis: { synthesized: string | null; sourceCount: number };
  thumbnail: string | null;
  canonicalEmbeddingText: string;
};

export interface BuildInfo {
  version: string;
  manamiVersion: string;
  buildDate: string;
  entryCount: number;
  embeddingModel: string;
  embeddingDimensions: number;
}

export function createDatabase(path: string): Database {
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  return db;
}

export function initializeSchema(db: Database): void {
  db.exec(SCHEMA);
}

export function setupFts(db: Database): void {
  db.exec(FTS_SCHEMA);
  db.exec(FTS_TRIGGERS);
}

export function insertAnime(db: Database, record: AnimeRecord): void {
  const insertAnime = db.prepare(`
    INSERT OR REPLACE INTO anime (
      id, title_canonical, title_alternatives, type, episodes, status,
      season_year, season_name, duration_seconds, sources, relations,
      thumbnail_url, synopsis_synthesized, synopsis_source_count, canonical_embedding_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAnime.run(
    record.id,
    record.titles.canonical,
    JSON.stringify(record.titles.alternatives),
    record.type,
    record.episodes,
    record.status,
    record.season.year,
    record.season.season,
    record.duration?.seconds ?? null,
    JSON.stringify(record.sources),
    JSON.stringify([]),
    record.thumbnail,
    record.synopsis.synthesized,
    record.synopsis.sourceCount,
    record.canonicalEmbeddingText
  );

  const deleteTags = db.prepare("DELETE FROM anime_tags WHERE anime_id = ?");
  deleteTags.run(record.id);

  const insertTag = db.prepare(`
    INSERT OR IGNORE INTO anime_tags (anime_id, category, value) VALUES (?, ?, ?)
  `);

  for (const tag of record.tags) {
    insertTag.run(record.id, tag.category, tag.value);
  }
}

export function insertAnimeBatch(db: Database, records: AnimeRecord[]): void {
  const insert = db.transaction((items: AnimeRecord[]) => {
    for (const record of items) {
      insertAnime(db, record);
    }
  });

  insert(records);
}

export function setBuildInfo(db: Database, info: BuildInfo): void {
  const insert = db.prepare("INSERT OR REPLACE INTO build_info (key, value) VALUES (?, ?)");

  insert.run("version", info.version);
  insert.run("manami_version", info.manamiVersion);
  insert.run("build_date", info.buildDate);
  insert.run("entry_count", String(info.entryCount));
  insert.run("embedding_model", info.embeddingModel);
  insert.run("embedding_dimensions", String(info.embeddingDimensions));
}

export function getBuildInfo(db: Database): BuildInfo | null {
  const query = db.prepare("SELECT key, value FROM build_info");
  const rows = query.all() as { key: string; value: string }[];

  if (rows.length === 0) return null;

  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    version: map.get("version") ?? "",
    manamiVersion: map.get("manami_version") ?? "",
    buildDate: map.get("build_date") ?? "",
    entryCount: Number.parseInt(map.get("entry_count") ?? "0", 10),
    embeddingModel: map.get("embedding_model") ?? "nomic-ai/nomic-embed-text-v1.5",
    embeddingDimensions: Number.parseInt(map.get("embedding_dimensions") ?? "768", 10),
  };
}

export function buildSqlite(records: AnimeRecord[], outputPath: string, info: BuildInfo): void {
  const db = createDatabase(outputPath);

  try {
    initializeSchema(db);
    insertAnimeBatch(db, records);
    setupFts(db);
    setBuildInfo(db, info);

    db.exec("INSERT INTO anime_fts(anime_fts) VALUES ('optimize')");
  } finally {
    db.close();
  }
}
