import type { Database } from "bun:sqlite";
import type { AnimeStatus, AnimeType, NormalizedTag } from "@anime-rag/core";
import { type InfinityClient, topK } from "@anime-rag/embed";

export interface AnimeSearchResult {
  id: string;
  title: string;
  alternatives: string[];
  type: string;
  episodes: number;
  status: string;
  year: number | null;
  tags: NormalizedTag[];
  synopsis: string | null;
  score: number;
  matchType: "fts" | "vector" | "hybrid";
}

export interface SearchOptions {
  limit?: number;
  filters?: {
    type?: AnimeType[];
    status?: AnimeStatus[];
    yearMin?: number;
    yearMax?: number;
    tags?: string[];
  };
}

export class AnimeSearch {
  private readonly db: Database;
  private readonly client: InfinityClient | null;
  private readonly vectors: Map<string, Float32Array> | null;

  constructor(
    db: Database,
    client: InfinityClient | null,
    vectors: Map<string, Float32Array> | null
  ) {
    this.db = db;
    this.client = client;
    this.vectors = vectors;
  }

  ftsSearch(query: string, limit: number): AnimeSearchResult[] {
    const sql = `
      SELECT 
        a.id, a.title_canonical, a.title_alternatives, a.type, a.episodes,
        a.status, a.season_year, a.synopsis_synthesized,
        bm25(anime_fts) as rank
      FROM anime_fts f
      JOIN anime a ON f.rowid = a.rowid
      WHERE anime_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `;

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(query, limit) as Record<string, unknown>[];

    return rows.map((row) => this.rowToResult(row, "fts", 1 / (1 + Math.abs(row.rank as number))));
  }

  async vectorSearch(query: string, limit: number): Promise<AnimeSearchResult[]> {
    if (!this.client || !this.vectors) {
      return [];
    }

    const queryVectors = await this.client.embed([query], "search_query");
    const queryVec = queryVectors[0];

    const allVectors = Array.from(this.vectors.entries());
    const topResults = topK(
      queryVec,
      allVectors.map(([, v]) => v),
      limit * 2
    );

    const results: AnimeSearchResult[] = [];

    for (const result of topResults) {
      const [id] = allVectors[result.index];
      const anime = this.getById(id);
      if (anime) {
        results.push({ ...anime, score: result.score, matchType: "vector" });
      }
    }

    return results.slice(0, limit);
  }

  async hybridSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<{
    results: AnimeSearchResult[];
    totalMatches: number;
    searchMode: "hybrid" | "fts_only";
  }> {
    const limit = options.limit ?? 10;

    if (!this.client || !this.vectors) {
      const ftsResults = this.ftsSearch(query, limit);
      return {
        results: ftsResults,
        totalMatches: ftsResults.length,
        searchMode: "fts_only",
      };
    }

    const ftsResults = this.ftsSearch(query, limit * 2);
    const vectorResults = await this.vectorSearch(query, limit * 2);

    const merged = this.reciprocalRankFusion(ftsResults, vectorResults);

    return {
      results: merged.slice(0, limit),
      totalMatches: merged.length,
      searchMode: "hybrid",
    };
  }

  getById(id: string): AnimeSearchResult | null {
    const sql = `
      SELECT 
        a.id, a.title_canonical, a.title_alternatives, a.type, a.episodes,
        a.status, a.season_year, a.synopsis_synthesized
      FROM anime a
      WHERE a.id = ?
    `;

    const stmt = this.db.prepare(sql);
    const row = stmt.get(id) as Record<string, unknown> | null;

    if (!row) return null;
    return this.rowToResult(row, "fts", 1);
  }

  searchByTitle(title: string, limit = 5): AnimeSearchResult[] {
    const sql = `
      SELECT 
        a.id, a.title_canonical, a.title_alternatives, a.type, a.episodes,
        a.status, a.season_year, a.synopsis_synthesized
      FROM anime a
      WHERE a.title_canonical LIKE ? OR a.title_alternatives LIKE ?
      LIMIT ?
    `;

    const pattern = `%${title}%`;
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(pattern, pattern, limit) as Record<string, unknown>[];

    return rows.map((row) => this.rowToResult(row, "fts", 1));
  }

  getTags(animeId: string): NormalizedTag[] {
    const sql = "SELECT category, value FROM anime_tags WHERE anime_id = ?";
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(animeId) as { category: string; value: string }[];

    return rows.map((r) => ({ category: r.category as NormalizedTag["category"], value: r.value }));
  }

  private reciprocalRankFusion(
    ftsResults: AnimeSearchResult[],
    vectorResults: AnimeSearchResult[],
    k = 60
  ): AnimeSearchResult[] {
    const scores = new Map<string, number>();
    const resultMap = new Map<string, AnimeSearchResult>();

    for (let i = 0; i < ftsResults.length; i++) {
      const result = ftsResults[i];
      const current = scores.get(result.id) ?? 0;
      scores.set(result.id, current + 1 / (k + i + 1));
      resultMap.set(result.id, { ...result, matchType: "hybrid" });
    }

    for (let i = 0; i < vectorResults.length; i++) {
      const result = vectorResults[i];
      const current = scores.get(result.id) ?? 0;
      scores.set(result.id, current + 1 / (k + i + 1));
      resultMap.set(result.id, { ...result, matchType: "hybrid" });
    }

    const sorted = Array.from(scores.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id, score]) => {
        const result = resultMap.get(id)!;
        return { ...result, score };
      });

    return sorted;
  }

  private rowToResult(
    row: Record<string, unknown>,
    matchType: "fts" | "vector" | "hybrid",
    score: number
  ): AnimeSearchResult {
    const alternatives = row.title_alternatives ? JSON.parse(row.title_alternatives as string) : [];

    return {
      id: row.id as string,
      title: row.title_canonical as string,
      alternatives,
      type: row.type as string,
      episodes: row.episodes as number,
      status: row.status as string,
      year: row.season_year as number | null,
      tags: this.getTags(row.id as string),
      synopsis: row.synopsis_synthesized as string | null,
      score,
      matchType,
    };
  }
}
