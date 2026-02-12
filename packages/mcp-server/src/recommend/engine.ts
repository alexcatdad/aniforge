import { centroid, cosineSimilarity, jaccardSimilarity } from "@anime-rag/embed";
import type { AnimeSearchResult } from "../search/engine";
import type { AnimeSearch } from "../search/engine";

export interface RecommendSignal {
  semantic: number;
  taxonomy: number;
  temporal: number;
  format: number;
}

export interface RecommendResult extends AnimeSearchResult {
  similarityScore: number;
  signals: RecommendSignal;
}

export interface RecommendOptions {
  titles: string[];
  preferences?: string;
  excludeTitles?: string[];
  limit?: number;
}

const DEFAULT_WEIGHTS = {
  semantic: 0.5,
  taxonomy: 0.2,
  temporal: 0.15,
  format: 0.15,
};

export class RecommendEngine {
  private readonly search: AnimeSearch;
  private readonly vectors: Map<string, Float32Array> | null;

  constructor(search: AnimeSearch, vectors: Map<string, Float32Array> | null) {
    this.search = search;
    this.vectors = vectors;
  }

  async recommend(options: RecommendOptions): Promise<{
    recommendations: RecommendResult[];
    tasteCentroid: string[];
  }> {
    const { titles, excludeTitles = [], limit = 8 } = options;

    const likedAnime: AnimeSearchResult[] = [];
    const likedVectors: Float32Array[] = [];
    const likedTags = new Set<string>();
    const likedYears: number[] = [];
    const likedTypes = new Map<string, number>();

    for (const title of titles) {
      const results = this.search.searchByTitle(title, 1);
      if (results.length > 0) {
        const anime = results[0];
        likedAnime.push(anime);

        if (this.vectors?.has(anime.id)) {
          likedVectors.push(this.vectors.get(anime.id)!);
        }

        for (const tag of anime.tags) {
          likedTags.add(`${tag.category}:${tag.value}`);
        }

        if (anime.year) {
          likedYears.push(anime.year);
        }

        const count = likedTypes.get(anime.type) ?? 0;
        likedTypes.set(anime.type, count + 1);
      }
    }

    if (likedVectors.length === 0) {
      return { recommendations: [], tasteCentroid: [] };
    }

    const tasteVector = centroid(likedVectors);
    const preferredYear =
      likedYears.length > 0
        ? Math.round(likedYears.reduce((a, b) => a + b, 0) / likedYears.length)
        : null;
    const preferredType = [...likedTypes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const topTags = [...likedTags].slice(0, 5);

    let candidates: AnimeSearchResult[];

    if (this.vectors) {
      const allEntries = Array.from(this.vectors.entries());
      const similarities = allEntries.map(([id, vec]) => ({
        id,
        score: cosineSimilarity(tasteVector, vec),
      }));

      similarities.sort((a, b) => b.score - a.score);

      const topIds = similarities.slice(0, 100).map((s) => s.id);
      candidates = topIds
        .map((id) => this.search.getById(id))
        .filter((r): r is AnimeSearchResult => r !== null);
    } else {
      candidates = likedAnime.flatMap((anime) => this.search.searchByTitle(anime.title, 20));
    }

    const excludeSet = new Set(excludeTitles.map((t) => t.toLowerCase()));
    const likedSet = new Set(likedAnime.map((a) => a.id));

    const filtered = candidates.filter(
      (c) => !likedSet.has(c.id) && !excludeSet.has(c.title.toLowerCase())
    );

    const scored = filtered.map((candidate) => {
      const signals = this.computeSignals(
        candidate,
        tasteVector,
        likedTags,
        preferredYear,
        preferredType
      );

      const similarityScore = this.blendedScore(signals);

      return { ...candidate, similarityScore, signals };
    });

    scored.sort((a, b) => b.similarityScore - a.similarityScore);

    return {
      recommendations: scored.slice(0, limit),
      tasteCentroid: topTags,
    };
  }

  private computeSignals(
    candidate: AnimeSearchResult,
    tasteVector: Float32Array,
    likedTags: Set<string>,
    preferredYear: number | null,
    preferredType: string | null
  ): RecommendSignal {
    let semantic = 0;
    if (this.vectors?.has(candidate.id)) {
      semantic = cosineSimilarity(tasteVector, this.vectors.get(candidate.id)!);
    }

    const candidateTags = new Set(candidate.tags.map((t) => `${t.category}:${t.value}`));
    const taxonomy = jaccardSimilarity(likedTags, candidateTags);

    let temporal = 0;
    if (preferredYear !== null && candidate.year !== null) {
      const diff = Math.abs(candidate.year - preferredYear);
      temporal = Math.exp(-(diff * diff) / (2 * 5 * 5));
    }

    let format = 0;
    if (preferredType !== null) {
      format = candidate.type === preferredType ? 1 : 0.3;
    }

    return { semantic, taxonomy, temporal, format };
  }

  private blendedScore(signals: RecommendSignal): number {
    return (
      DEFAULT_WEIGHTS.semantic * signals.semantic +
      DEFAULT_WEIGHTS.taxonomy * signals.taxonomy +
      DEFAULT_WEIGHTS.temporal * signals.temporal +
      DEFAULT_WEIGHTS.format * signals.format
    );
  }
}
