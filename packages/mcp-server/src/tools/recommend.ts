import { RecommendEngine, type RecommendOptions } from "../recommend/engine";
import type { AnimeSearch } from "../search/engine";

export interface RecommendSimilarInput {
  titles: string[];
  preferences?: string;
  excludeTitles?: string[];
  limit?: number;
}

export interface RecommendSimilarOutput {
  recommendations: Array<{
    id: string;
    title: string;
    type: string;
    episodes: number;
    year: number | null;
    tags: Array<{ category: string; value: string }>;
    synopsis: string | null;
    similarityScore: number;
    signals: {
      semantic: number;
      taxonomy: number;
      temporal: number;
      format: number;
    };
  }>;
  tasteCentroid: string[];
}

export async function recommendSimilar(
  search: AnimeSearch,
  vectors: Map<string, Float32Array> | null,
  input: RecommendSimilarInput
): Promise<RecommendSimilarOutput> {
  const engine = new RecommendEngine(search, vectors);

  const options: RecommendOptions = {
    titles: input.titles,
    preferences: input.preferences,
    excludeTitles: input.excludeTitles,
    limit: input.limit ?? 8,
  };

  const result = await engine.recommend(options);

  return {
    recommendations: result.recommendations.map((r) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      episodes: r.episodes,
      year: r.year,
      tags: r.tags,
      synopsis: r.synopsis,
      similarityScore: r.similarityScore,
      signals: r.signals,
    })),
    tasteCentroid: result.tasteCentroid,
  };
}
