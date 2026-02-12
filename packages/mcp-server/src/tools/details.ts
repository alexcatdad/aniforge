import type { Database } from "bun:sqlite";

export interface GetAnimeDetailsInput {
  title?: string;
  id?: string;
}

export interface GetAnimeDetailsOutput {
  anime: {
    id: string;
    titles: { canonical: string; alternatives: string[] };
    type: string;
    episodes: number;
    status: string;
    season: { year: number | null; season: string | null };
    duration: number | null;
    sources: string[];
    relations: string[];
    tags: Array<{ category: string; value: string }>;
    synopsis: string | null;
  } | null;
}

export function getAnimeDetails(db: Database, input: GetAnimeDetailsInput): GetAnimeDetailsOutput {
  let row: Record<string, unknown> | null = null;

  if (input.id) {
    const stmt = db.prepare("SELECT * FROM anime WHERE id = ?");
    row = stmt.get(input.id) as Record<string, unknown> | null;
  } else if (input.title) {
    const stmt = db.prepare(`
      SELECT * FROM anime 
      WHERE title_canonical LIKE ? OR title_alternatives LIKE ?
      LIMIT 1
    `);
    const pattern = `%${input.title}%`;
    row = stmt.get(pattern, pattern) as Record<string, unknown> | null;
  }

  if (!row) {
    return { anime: null };
  }

  const tagsStmt = db.prepare("SELECT category, value FROM anime_tags WHERE anime_id = ?");
  const tagRows = tagsStmt.all(row.id) as { category: string; value: string }[];

  return {
    anime: {
      id: row.id as string,
      titles: {
        canonical: row.title_canonical as string,
        alternatives: row.title_alternatives ? JSON.parse(row.title_alternatives as string) : [],
      },
      type: row.type as string,
      episodes: row.episodes as number,
      status: row.status as string,
      season: {
        year: row.season_year as number | null,
        season: row.season_name as string | null,
      },
      duration: row.duration_seconds as number | null,
      sources: row.sources ? JSON.parse(row.sources as string) : [],
      relations: row.relations ? JSON.parse(row.relations as string) : [],
      tags: tagRows.map((t) => ({ category: t.category, value: t.value })),
      synopsis: row.synopsis_synthesized as string | null,
    },
  };
}
