import type { NormalizedTag } from "../types/anime";

export const TAXONOMY_MAP: Record<string, NormalizedTag> = {
  "Sci-Fi": { category: "genre", value: "science_fiction" },
  "Sci Fi": { category: "genre", value: "science_fiction" },
  "Science Fiction": { category: "genre", value: "science_fiction" },
  Action: { category: "genre", value: "action" },
  Adventure: { category: "genre", value: "adventure" },
  Comedy: { category: "genre", value: "comedy" },
  Drama: { category: "genre", value: "drama" },
  Fantasy: { category: "genre", value: "fantasy" },
  Horror: { category: "genre", value: "horror" },
  Mystery: { category: "genre", value: "mystery" },
  Romance: { category: "genre", value: "romance" },
  Thriller: { category: "genre", value: "thriller" },
  Sports: { category: "genre", value: "sports" },
  Sport: { category: "genre", value: "sports" },
  "Slice of Life": { category: "genre", value: "slice_of_life" },
  "Slice of life": { category: "genre", value: "slice_of_life" },
  Ecchi: { category: "genre", value: "ecchi" },
  Harem: { category: "genre", value: "harem" },
  Mecha: { category: "genre", value: "mecha" },
  Music: { category: "genre", value: "music" },
  Psychological: { category: "genre", value: "psychological" },
  Supernatural: { category: "genre", value: "supernatural" },
  Military: { category: "genre", value: "military" },
  Historical: { category: "genre", value: "historical" },
  Gore: { category: "genre", value: "gore" },
  "Award Winning": { category: "genre", value: "award_winning" },
  Gourmet: { category: "genre", value: "gourmet" },
  Suspense: { category: "genre", value: "suspense" },
  "Girls Love": { category: "genre", value: "girls_love" },
  GL: { category: "genre", value: "girls_love" },
  Yuri: { category: "genre", value: "girls_love" },
  "Boys Love": { category: "genre", value: "boys_love" },
  BL: { category: "genre", value: "boys_love" },
  Yaoi: { category: "genre", value: "boys_love" },
  Erotica: { category: "genre", value: "erotica" },
  "Avant Garde": { category: "genre", value: "avant_garde" },
  "Avant-Garde": { category: "genre", value: "avant_garde" },
  "Adult Cast": { category: "genre", value: "adult_cast" },
  Isekai: { category: "theme", value: "isekai" },
  "Time Travel": { category: "theme", value: "time_travel" },
  "Time travel": { category: "theme", value: "time_travel" },
  "Super Power": { category: "theme", value: "superpowers" },
  "super power": { category: "theme", value: "superpowers" },
  Superpowers: { category: "theme", value: "superpowers" },
  School: { category: "theme", value: "school" },
  "School Life": { category: "theme", value: "school" },
  "Mahou Shoujo": { category: "theme", value: "magical_girl" },
  "Magical Girl": { category: "theme", value: "magical_girl" },
  Cyberpunk: { category: "theme", value: "cyberpunk" },
  "Post-Apocalyptic": { category: "theme", value: "post_apocalyptic" },
  Apocalypse: { category: "theme", value: "apocalypse" },
  Space: { category: "theme", value: "space" },
  Idol: { category: "theme", value: "idol" },
  Idols: { category: "theme", value: "idol" },
  "Reverse Harem": { category: "theme", value: "reverse_harem" },
  Otome: { category: "theme", value: "otome" },
  "Video Game": { category: "theme", value: "video_game" },
  Gaming: { category: "theme", value: "video_game" },
  Reincarnation: { category: "theme", value: "reincarnation" },
  Vampire: { category: "theme", value: "vampire" },
  Zombie: { category: "theme", value: "zombie" },
  Samurai: { category: "theme", value: "samurai" },
  Ninja: { category: "theme", value: "ninja" },
  Detective: { category: "theme", value: "detective" },
  Police: { category: "theme", value: "police" },
  CGDCT: { category: "theme", value: "cgdct" },
  "Cute Girls Doing Cute Things": { category: "theme", value: "cgdct" },
  Workplace: { category: "theme", value: "workplace" },
  Office: { category: "theme", value: "workplace" },
  Survival: { category: "theme", value: "survival" },
  Shounen: { category: "demographic", value: "shounen" },
  Shonen: { category: "demographic", value: "shounen" },
  Shoujo: { category: "demographic", value: "shoujo" },
  Shojo: { category: "demographic", value: "shoujo" },
  Seinen: { category: "demographic", value: "seinen" },
  Josei: { category: "demographic", value: "josei" },
  Kids: { category: "demographic", value: "kids" },
  Kodomo: { category: "demographic", value: "kids" },
  "Historical Setting": { category: "setting", value: "historical" },
  "Feudal Japan": { category: "setting", value: "historical_japan" },
  Medieval: { category: "setting", value: "medieval" },
  Urban: { category: "setting", value: "urban" },
  "Urban Fantasy": { category: "setting", value: "urban_fantasy" },
  Rural: { category: "setting", value: "rural" },
  "Fantasy World": { category: "setting", value: "fantasy_world" },
  "Parallel World": { category: "setting", value: "parallel_world" },
  Future: { category: "setting", value: "futuristic" },
  Futuristic: { category: "setting", value: "futuristic" },
};

export function normalizeTag(providerTag: string): NormalizedTag {
  const normalized = TAXONOMY_MAP[providerTag];
  if (normalized) return normalized;
  return { category: "unmapped", value: providerTag.toLowerCase().replace(/\s+/g, "_") };
}

export function normalizeTags(providerTags: string[]): NormalizedTag[] {
  const seen = new Set<string>();
  const result: NormalizedTag[] = [];

  for (const tag of providerTags) {
    const normalized = normalizeTag(tag);
    const key = `${normalized.category}:${normalized.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(normalized);
    }
  }

  return result.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.value.localeCompare(b.value);
  });
}
