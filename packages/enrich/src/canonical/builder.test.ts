import { describe, test, expect } from "bun:test";
import { buildCanonicalText, buildCanonicalTextFromData } from "./builder";
import type { NormalizedTag, AnimeRecord } from "@anime-rag/core";

describe("buildCanonicalText", () => {
  function createRecord(overrides: Partial<AnimeRecord> = {}): AnimeRecord {
    return {
      id: "test-1",
      titles: { canonical: "Test Anime", alternatives: [] },
      type: "TV",
      episodes: 12,
      status: "FINISHED",
      season: { year: 2020, season: "SPRING" },
      duration: null,
      sources: ["https://anilist.co/anime/1"],
      tags: [],
      synopsis: { synthesized: null, sourceCount: 0 },
      thumbnail: null,
      canonicalEmbeddingText: "",
      ...overrides,
    };
  }

  test("includes title as first part", () => {
    const record = createRecord({ titles: { canonical: "My Anime", alternatives: [] } });
    const text = buildCanonicalText(record);
    expect(text.startsWith("My Anime")).toBe(true);
  });

  test("includes alternative titles when present", () => {
    const record = createRecord({
      titles: { canonical: "Main", alternatives: ["Alt1", "Alt2"] },
    });
    const text = buildCanonicalText(record);
    expect(text).toContain("Also known as:");
    expect(text).toContain("Alt1");
    expect(text).toContain("Alt2");
  });

  test("limits alternative titles to 5", () => {
    const record = createRecord({
      titles: {
        canonical: "Main",
        alternatives: ["A1", "A2", "A3", "A4", "A5", "A6", "A7"],
      },
    });
    const text = buildCanonicalText(record);
    expect(text).toContain("A5");
    expect(text).not.toContain("A6");
  });

  test("includes type and episodes", () => {
    const record = createRecord({ type: "MOVIE", episodes: 1 });
    const text = buildCanonicalText(record);
    expect(text).toContain("MOVIE");
    expect(text).toContain("1 episodes");
  });

  test("includes year and season when present", () => {
    const record = createRecord({ season: { year: 2023, season: "FALL" } });
    const text = buildCanonicalText(record);
    expect(text).toContain("FALL");
    expect(text).toContain("2023");
  });

  test("includes year without season", () => {
    const record = createRecord({ season: { year: 2023, season: null } });
    const text = buildCanonicalText(record);
    expect(text).toContain("2023");
  });

  test("includes genre tags", () => {
    const record = createRecord({
      tags: [
        { category: "genre", value: "action" },
        { category: "genre", value: "drama" },
      ],
    });
    const text = buildCanonicalText(record);
    expect(text).toContain("Genres:");
    expect(text).toContain("action");
    expect(text).toContain("drama");
  });

  test("includes theme tags", () => {
    const record = createRecord({
      tags: [{ category: "theme", value: "isekai" }],
    });
    const text = buildCanonicalText(record);
    expect(text).toContain("Themes:");
    expect(text).toContain("isekai");
  });

  test("includes synopsis when present", () => {
    const record = createRecord({
      synopsis: { synthesized: "A great story about heroes.", sourceCount: 2 },
    });
    const text = buildCanonicalText(record);
    expect(text).toContain("A great story about heroes.");
  });

  test("works without synopsis", () => {
    const record = createRecord({ synopsis: { synthesized: null, sourceCount: 0 } });
    const text = buildCanonicalText(record);
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("buildCanonicalTextFromData", () => {
  test("builds text from data object", () => {
    const text = buildCanonicalTextFromData({
      title: "Test",
      alternatives: [],
      type: "TV",
      episodes: 12,
      year: 2020,
      season: "SPRING",
      tags: [{ category: "genre", value: "action" }],
      synopsis: "A story.",
    });

    expect(text).toContain("Test");
    expect(text).toContain("TV");
    expect(text).toContain("12 episodes");
    expect(text).toContain("A story.");
  });
});
