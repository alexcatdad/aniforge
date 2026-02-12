export type ManamiSeason = "SPRING" | "SUMMER" | "FALL" | "WINTER" | "UNDEFINED";

export interface ManamiAnimeSeason {
  season: ManamiSeason;
  year: number | null;
}

export interface ManamiEntry {
  sources: string[];
  title: string;
  type: string;
  episodes: number;
  status: string;
  animeSeason: ManamiAnimeSeason;
  picture: string;
  thumbnail: string;
  synonyms: string[];
  relations: string[];
  tags: string[];
}

export interface ManamiRelease {
  license: { name: string; url: string };
  repository: string;
  lastUpdate: string;
  data: ManamiEntry[];
}
