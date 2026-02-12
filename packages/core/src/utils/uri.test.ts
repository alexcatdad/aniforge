import { describe, test, expect } from "bun:test";
import { extractProviderId, extractProviderIds, buildAnimeId } from "./uri";

describe("extractProviderId", () => {
  test("extracts AniList ID from URI", () => {
    const result = extractProviderId("https://anilist.co/anime/5114");
    expect(result).toEqual({ provider: "anilist", id: "5114" });
  });

  test("extracts Kitsu ID from URI", () => {
    const result = extractProviderId("https://kitsu.app/anime/1376");
    expect(result).toEqual({ provider: "kitsu", id: "1376" });
  });

  test("extracts MAL ID from URI", () => {
    const result = extractProviderId("https://myanimelist.net/anime/5114");
    expect(result).toEqual({ provider: "mal", id: "5114" });
  });

  test("extracts AniDB ID from URI", () => {
    const result = extractProviderId("https://anidb.net/anime/123");
    expect(result).toEqual({ provider: "anidb", id: "123" });
  });

  test("returns null for unknown URI format", () => {
    expect(extractProviderId("https://unknown.com/anime/123")).toBeNull();
  });

  test("returns null for malformed URI", () => {
    expect(extractProviderId("not-a-url")).toBeNull();
  });
});

describe("extractProviderIds", () => {
  test("extracts all provider IDs from source URIs", () => {
    const sources = [
      "https://anilist.co/anime/5114",
      "https://kitsu.app/anime/1376",
      "https://myanimelist.net/anime/5114",
    ];

    const result = extractProviderIds(sources);

    expect(result.anilist).toBe("5114");
    expect(result.kitsu).toBe("1376");
    expect(result.mal).toBe("5114");
    expect(result.anidb).toBeNull();
  });

  test("returns null for all providers when no sources", () => {
    const result = extractProviderIds([]);

    expect(result.anilist).toBeNull();
    expect(result.kitsu).toBeNull();
    expect(result.mal).toBeNull();
    expect(result.anidb).toBeNull();
  });

  test("handles mixed valid and invalid URIs", () => {
    const sources = [
      "https://anilist.co/anime/123",
      "https://invalid-url.com/anime/456",
    ];

    const result = extractProviderIds(sources);

    expect(result.anilist).toBe("123");
    expect(result.kitsu).toBeNull();
  });
});

describe("buildAnimeId", () => {
  test("returns consistent ID for same sources regardless of order", () => {
    const sources1 = ["https://anilist.co/anime/1", "https://kitsu.app/anime/2"];
    const sources2 = ["https://kitsu.app/anime/2", "https://anilist.co/anime/1"];

    expect(buildAnimeId(sources1)).toBe(buildAnimeId(sources2));
  });

  test("returns different IDs for different sources", () => {
    const sources1 = ["https://anilist.co/anime/1"];
    const sources2 = ["https://anilist.co/anime/2"];

    expect(buildAnimeId(sources1)).not.toBe(buildAnimeId(sources2));
  });

  test("returns string ID", () => {
    const result = buildAnimeId(["https://anilist.co/anime/1"]);
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});
