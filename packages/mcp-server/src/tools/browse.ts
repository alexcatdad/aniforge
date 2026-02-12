import type { Database } from "bun:sqlite";

export interface BrowseTaxonomyInput {
  category?: "genre" | "theme" | "demographic" | "setting";
  search?: string;
}

export interface BrowseTaxonomyOutput {
  categories: Array<{
    category: string;
    tags: Array<{ value: string; count: number }>;
  }>;
}

export function browseTaxonomy(db: Database, input: BrowseTaxonomyInput): BrowseTaxonomyOutput {
  let sql = `
    SELECT category, value, COUNT(*) as count
    FROM anime_tags
  `;

  const conditions: string[] = [];
  const params: string[] = [];

  if (input.category) {
    conditions.push("category = ?");
    params.push(input.category);
  }

  if (input.search) {
    conditions.push("value LIKE ?");
    params.push(`%${input.search}%`);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ${conditions.join(" AND ")}`;
  }

  sql += " GROUP BY category, value ORDER BY count DESC";

  const stmt = db.prepare(sql);
  const rows = stmt.all(...params) as { category: string; value: string; count: number }[];

  const categoryMap = new Map<string, Array<{ value: string; count: number }>>();

  for (const row of rows) {
    const tags = categoryMap.get(row.category) ?? [];
    tags.push({ value: row.value, count: row.count });
    categoryMap.set(row.category, tags);
  }

  const categories = Array.from(categoryMap.entries())
    .map(([category, tags]) => ({ category, tags }))
    .sort((a, b) => a.category.localeCompare(b.category));

  return { categories };
}
