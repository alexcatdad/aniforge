import { describe, test, expect } from "bun:test";
import { diff, type Changeset } from "./differ";
import type { ManamiEntry, ManamiRelease } from "./types";

function createEntry(overrides: Partial<ManamiEntry> = {}): ManamiEntry {
  return {
    sources: ["https://anilist.co/anime/1"],
    title: "Test Anime",
    type: "TV",
    episodes: 12,
    status: "FINISHED",
    animeSeason: { season: "SPRING", year: 2020 },
    picture: "",
    thumbnail: "",
    synonyms: [],
    relations: [],
    tags: ["Action"],
    ...overrides,
  };
}

function createRelease(entries: ManamiEntry[], lastUpdate = "2024-01-01"): ManamiRelease {
  return {
    license: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
    repository: "https://github.com/manami-project/anime-offline-database",
    lastUpdate,
    data: entries,
  };
}

describe("diff", () => {
  test("returns all entries as added when no previous release", () => {
    const entry1 = createEntry({ sources: ["https://anilist.co/anime/1"] });
    const entry2 = createEntry({ sources: ["https://anilist.co/anime/2"] });
    const current = createRelease([entry1, entry2]);

    const result = diff(null, current);

    expect(result.added).toHaveLength(2);
    expect(result.removed).toHaveLength(0);
    expect(result.changed).toHaveLength(0);
    expect(result.unchanged).toBe(0);
  });

  test("identifies added entries", () => {
    const previous = createRelease([createEntry({ sources: ["https://anilist.co/anime/1"] })]);
    const current = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"] }),
      createEntry({ sources: ["https://anilist.co/anime/2"] }),
    ]);

    const result = diff(previous, current);

    expect(result.added).toHaveLength(1);
    expect(result.added[0].sources).toContain("https://anilist.co/anime/2");
  });

  test("identifies removed entries", () => {
    const previous = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"] }),
      createEntry({ sources: ["https://anilist.co/anime/2"] }),
    ]);
    const current = createRelease([createEntry({ sources: ["https://anilist.co/anime/1"] })]);

    const result = diff(previous, current);

    expect(result.removed).toHaveLength(1);
  });

  test("identifies changed entries", () => {
    const previous = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"], episodes: 12 }),
    ]);
    const current = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"], episodes: 24 }),
    ]);

    const result = diff(previous, current);

    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].changedFields).toContain("episodes");
  });

  test("counts unchanged entries", () => {
    const previous = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"] }),
      createEntry({ sources: ["https://anilist.co/anime/2"] }),
    ]);
    const current = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"] }),
      createEntry({ sources: ["https://anilist.co/anime/2"] }),
    ]);

    const result = diff(previous, current);

    expect(result.unchanged).toBe(2);
  });

  test("detects title change", () => {
    const previous = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"], title: "Old Title" }),
    ]);
    const current = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"], title: "New Title" }),
    ]);

    const result = diff(previous, current);

    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].changedFields).toContain("title");
  });

  test("detects tags change", () => {
    const previous = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"], tags: ["Action"] }),
    ]);
    const current = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"], tags: ["Action", "Drama"] }),
    ]);

    const result = diff(previous, current);

    expect(result.changed).toHaveLength(1);
    expect(result.changed[0].changedFields).toContain("tags");
  });

  test("detects sources change as added+removed (identity changes)", () => {
    const previous = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1"] }),
    ]);
    const current = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1", "https://kitsu.app/anime/1"] }),
    ]);

    const result = diff(previous, current);

    expect(result.added).toHaveLength(1);
    expect(result.removed).toHaveLength(1);
  });

  test("identifies entry by sorted sources", () => {
    const previous = createRelease([
      createEntry({ sources: ["https://kitsu.app/anime/1", "https://anilist.co/anime/1"] }),
    ]);
    const current = createRelease([
      createEntry({ sources: ["https://anilist.co/anime/1", "https://kitsu.app/anime/1"] }),
    ]);

    const result = diff(previous, current);

    expect(result.unchanged).toBe(1);
  });

  test("records version info", () => {
    const previous = createRelease([], "2024-01-01");
    const current = createRelease([], "2024-01-08");

    const result = diff(previous, current);

    expect(result.previousVersion).toBe("2024-01-01");
    expect(result.currentVersion).toBe("2024-01-08");
  });
});
