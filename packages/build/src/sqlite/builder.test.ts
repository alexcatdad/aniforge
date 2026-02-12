import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import {
  createDatabase,
  initializeSchema,
  setupFts,
  insertAnime,
  setBuildInfo,
  getBuildInfo,
  type AnimeRecord,
} from "./builder";

function createRecord(overrides: Partial<AnimeRecord> = {}): AnimeRecord {
  return {
    id: "test-1",
    titles: { canonical: "Test Anime", alternatives: ["Alt Title"] },
    type: "TV",
    episodes: 12,
    status: "FINISHED",
    season: { year: 2020, season: "SPRING" },
    duration: null,
    sources: ["https://anilist.co/anime/1"],
    tags: [{ category: "genre", value: "action" }],
    synopsis: { synthesized: "A test synopsis.", sourceCount: 2 },
    thumbnail: null,
    canonicalEmbeddingText: "Test Anime. TV, 12 episodes. A test synopsis.",
    ...overrides,
  };
}

describe("SQLite Builder", () => {
  let db: Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-${Date.now()}.sqlite`);
    db = createDatabase(dbPath);
  });

  afterEach(() => {
    db.close();
    rmSync(dbPath, { force: true });
  });

  test("creates database with WAL mode", () => {
    const result = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
    expect(result.journal_mode).toBe("wal");
  });

  test("initializes schema", () => {
    initializeSchema(db);

    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];

    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("anime");
    expect(tableNames).toContain("anime_tags");
    expect(tableNames).toContain("build_info");
  });

  test("inserts anime record", () => {
    initializeSchema(db);

    const record = createRecord();
    insertAnime(db, record);

    const row = db.query("SELECT * FROM anime WHERE id = ?").get("test-1") as Record<string, unknown>;
    expect(row).toBeDefined();
    expect(row.title_canonical).toBe("Test Anime");
    expect(row.type).toBe("TV");
    expect(row.episodes).toBe(12);
  });

  test("inserts tags for anime", () => {
    initializeSchema(db);

    const record = createRecord({
      tags: [
        { category: "genre", value: "action" },
        { category: "theme", value: "isekai" },
      ],
    });
    insertAnime(db, record);

    const tags = db
      .query("SELECT * FROM anime_tags WHERE anime_id = ?")
      .all("test-1") as { category: string; value: string }[];

    expect(tags).toHaveLength(2);
    expect(tags.find((t) => t.value === "action")).toBeDefined();
    expect(tags.find((t) => t.value === "isekai")).toBeDefined();
  });

  test("replaces existing anime on upsert", () => {
    initializeSchema(db);

    insertAnime(db, createRecord({ episodes: 12 }));
    insertAnime(db, createRecord({ episodes: 24 }));

    const row = db.query("SELECT episodes FROM anime WHERE id = ?").get("test-1") as { episodes: number };
    expect(row.episodes).toBe(24);
  });

  test("sets and retrieves build info", () => {
    initializeSchema(db);

    setBuildInfo(db, {
      version: "2024.01.01",
      manamiVersion: "2024-01-01",
      buildDate: "2024-01-01T00:00:00Z",
      entryCount: 100,
      embeddingModel: "nomic-ai/nomic-embed-text-v1.5",
      embeddingDimensions: 768,
    });

    const info = getBuildInfo(db);

    expect(info).not.toBeNull();
    expect(info?.version).toBe("2024.01.01");
    expect(info?.entryCount).toBe(100);
  });

  test("FTS setup creates virtual table", () => {
    initializeSchema(db);
    setupFts(db);

    const tables = db
      .query("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as { name: string }[];

    expect(tables.map((t) => t.name)).toContain("anime_fts");
  });

  test("FTS search finds inserted anime", () => {
    initializeSchema(db);
    setupFts(db);

    insertAnime(db, createRecord({ titles: { canonical: "UniqueTitle", alternatives: [] } }));

    const results = db
      .query("SELECT * FROM anime_fts WHERE anime_fts MATCH ?")
      .all("UniqueTitle") as unknown[];

    expect(results.length).toBeGreaterThan(0);
  });

  test("stores JSON fields correctly", () => {
    initializeSchema(db);

    insertAnime(db, createRecord({
      titles: { canonical: "Test", alternatives: ["Alt1", "Alt2"] },
      sources: ["https://anilist.co/anime/1", "https://kitsu.app/anime/1"],
    }));

    const row = db.query("SELECT title_alternatives, sources FROM anime WHERE id = ?").get("test-1") as {
      title_alternatives: string;
      sources: string;
    };

    const alternatives = JSON.parse(row.title_alternatives);
    const sources = JSON.parse(row.sources);

    expect(alternatives).toEqual(["Alt1", "Alt2"]);
    expect(sources).toHaveLength(2);
  });
});
