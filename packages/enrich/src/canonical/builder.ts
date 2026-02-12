type NormalizedTag = {
  category: "genre" | "theme" | "demographic" | "setting" | "unmapped";
  value: string;
};

type AnimeRecord = {
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

export function buildCanonicalText(record: AnimeRecord): string {
  const parts: string[] = [];

  parts.push(record.titles.canonical);

  if (record.titles.alternatives.length > 0) {
    const topAlternatives = record.titles.alternatives.slice(0, 5);
    parts.push(`Also known as: ${topAlternatives.join(", ")}`);
  }

  parts.push(`${record.type}, ${record.episodes} episodes`);

  if (record.season.year) {
    const seasonStr = record.season.season ? `${record.season.season} ` : "";
    parts.push(`${seasonStr}${record.season.year}`);
  }

  const genres = record.tags.filter((t) => t.category === "genre").map((t) => t.value);
  const themes = record.tags.filter((t) => t.category === "theme").map((t) => t.value);

  if (genres.length > 0) {
    parts.push(`Genres: ${genres.join(", ")}`);
  }
  if (themes.length > 0) {
    parts.push(`Themes: ${themes.join(", ")}`);
  }

  if (record.synopsis.synthesized) {
    parts.push(record.synopsis.synthesized);
  }

  return parts.join(". ");
}

export function buildCanonicalTextFromData(data: {
  title: string;
  alternatives: string[];
  type: string;
  episodes: number;
  year: number | null;
  season: string | null;
  tags: NormalizedTag[];
  synopsis: string | null;
}): string {
  const parts: string[] = [];

  parts.push(data.title);

  if (data.alternatives.length > 0) {
    parts.push(`Also known as: ${data.alternatives.slice(0, 5).join(", ")}`);
  }

  parts.push(`${data.type}, ${data.episodes} episodes`);

  if (data.year) {
    const seasonStr = data.season ? `${data.season} ` : "";
    parts.push(`${seasonStr}${data.year}`);
  }

  const genres = data.tags.filter((t) => t.category === "genre").map((t) => t.value);
  const themes = data.tags.filter((t) => t.category === "theme").map((t) => t.value);

  if (genres.length > 0) {
    parts.push(`Genres: ${genres.join(", ")}`);
  }
  if (themes.length > 0) {
    parts.push(`Themes: ${themes.join(", ")}`);
  }

  if (data.synopsis) {
    parts.push(data.synopsis);
  }

  return parts.join(". ");
}
