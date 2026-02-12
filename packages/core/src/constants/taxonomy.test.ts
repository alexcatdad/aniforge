import { describe, test, expect } from "bun:test";
import { normalizeTag, normalizeTags } from "./taxonomy";

describe("normalizeTag", () => {
  test("normalizes known tags to category and value", () => {
    const result = normalizeTag("Sci-Fi");
    expect(result).toEqual({ category: "genre", value: "science_fiction" });
  });

  test("handles case variations", () => {
    expect(normalizeTag("Sci Fi")).toEqual({ category: "genre", value: "science_fiction" });
    expect(normalizeTag("Science Fiction")).toEqual({ category: "genre", value: "science_fiction" });
  });

  test("normalizes themes", () => {
    expect(normalizeTag("Isekai")).toEqual({ category: "theme", value: "isekai" });
    expect(normalizeTag("Super Power")).toEqual({ category: "theme", value: "superpowers" });
    expect(normalizeTag("super power")).toEqual({ category: "theme", value: "superpowers" });
  });

  test("normalizes demographics", () => {
    expect(normalizeTag("Shounen")).toEqual({ category: "demographic", value: "shounen" });
    expect(normalizeTag("Shonen")).toEqual({ category: "demographic", value: "shounen" });
    expect(normalizeTag("Seinen")).toEqual({ category: "demographic", value: "seinen" });
    expect(normalizeTag("Josei")).toEqual({ category: "demographic", value: "josei" });
  });

  test("maps unknown tags to unmapped category", () => {
    const result = normalizeTag("SomeRandomTag");
    expect(result).toEqual({ category: "unmapped", value: "somerandomtag" });
  });

  test("converts unmapped values to lowercase snake_case", () => {
    expect(normalizeTag("New Tag Type")).toEqual({ category: "unmapped", value: "new_tag_type" });
  });
});

describe("normalizeTags", () => {
  test("deduplicates tags that normalize to same value", () => {
    const result = normalizeTags(["Sci-Fi", "Sci Fi", "Science Fiction"]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ category: "genre", value: "science_fiction" });
  });

  test("removes duplicates that normalize to same result", () => {
    const result = normalizeTags(["Shounen", "Shonen"]);
    expect(result).toHaveLength(1);
  });

  test("sorts by category then value", () => {
    const result = normalizeTags(["Isekai", "Action", "Shounen"]);
    expect(result[0]).toEqual({ category: "demographic", value: "shounen" });
    expect(result[1]).toEqual({ category: "genre", value: "action" });
    expect(result[2]).toEqual({ category: "theme", value: "isekai" });
  });

  test("returns empty array for empty input", () => {
    expect(normalizeTags([])).toEqual([]);
  });

  test("preserves unmapped tags", () => {
    const result = normalizeTags(["Action", "UnknownTag"]);
    expect(result).toHaveLength(2);
    expect(result.find((t) => t.value === "unknowntag")).toBeDefined();
  });

  test("handles mixed known and unknown tags", () => {
    const result = normalizeTags(["Action", "Mystery", "SomeNewTag"]);
    expect(result).toHaveLength(3);
    const genres = result.filter((t) => t.category === "genre");
    expect(genres).toHaveLength(2);
  });
});
