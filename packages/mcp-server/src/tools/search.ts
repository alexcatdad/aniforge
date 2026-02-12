import type { AnimeSearch } from "../search/engine";

export interface SearchAnimeInput {
  query: string;
  limit?: number;
  filters?: {
    type?: string[];
    status?: string[];
    yearMin?: number;
    yearMax?: number;
    tags?: string[];
  };
}

export interface SearchAnimeOutput {
  results: Array<{
    id: string;
    title: string;
    alternatives: string[];
    type: string;
    episodes: number;
    status: string;
    year: number | null;
    tags: Array<{ category: string; value: string }>;
    synopsis: string | null;
    score: number;
    matchType: string;
  }>;
  totalMatches: number;
  searchMode: string;
}

export async function searchAnime(
  search: AnimeSearch,
  input: SearchAnimeInput
): Promise<SearchAnimeOutput> {
  const result = await search.hybridSearch(input.query, {
    limit: input.limit ?? 10,
    filters: input.filters as undefined,
  });

  return {
    results: result.results.map((r) => ({
      id: r.id,
      title: r.title,
      alternatives: r.alternatives,
      type: r.type,
      episodes: r.episodes,
      status: r.status,
      year: r.year,
      tags: r.tags,
      synopsis: r.synopsis,
      score: r.score,
      matchType: r.matchType,
    })),
    totalMatches: result.totalMatches,
    searchMode: result.searchMode,
  };
}
