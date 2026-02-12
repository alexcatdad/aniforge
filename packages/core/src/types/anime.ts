export type AnimeType = "TV" | "MOVIE" | "OVA" | "ONA" | "SPECIAL" | "UNKNOWN";

export type AnimeStatus = "FINISHED" | "ONGOING" | "UPCOMING" | "UNKNOWN";

export type SeasonName = "WINTER" | "SPRING" | "SUMMER" | "FALL";

export type TagCategory = "genre" | "theme" | "demographic" | "setting" | "unmapped";

export interface NormalizedTag {
  category: TagCategory;
  value: string;
}

export interface AnimeRecord {
  id: string;
  titles: {
    canonical: string;
    alternatives: string[];
  };
  type: AnimeType;
  episodes: number;
  status: AnimeStatus;
  season: {
    year: number | null;
    season: SeasonName | null;
  };
  duration: {
    seconds: number;
    unit: "per_episode" | "total";
  } | null;
  sources: SourceURI[];
  tags: NormalizedTag[];
  synopsis: {
    synthesized: string | null;
    sourceCount: number;
  };
  thumbnail: string | null;
  canonicalEmbeddingText: string;
}

export type SourceURI = string;

export type ProviderName = "anilist" | "kitsu" | "mal" | "anidb";
