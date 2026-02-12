import { describe, test, expect } from "bun:test";
import { planInitialLoad, type WorkPlan } from "./work-planner";
import type { ManamiEntry } from "./manami/types";

function createEntry(overrides: Partial<ManamiEntry> = {}): ManamiEntry {
  return {
    sources: overrides.sources ?? ["https://anilist.co/anime/1"],
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

describe("planInitialLoad", () => {
  test("plans fetch for entries with provider sources", () => {
    const entries = [
      createEntry({ sources: ["https://anilist.co/anime/1"] }),
      createEntry({ sources: ["https://kitsu.app/anime/2"] }),
    ];

    const plan = planInitialLoad(entries);

    expect(plan.toFetch).toHaveLength(2);
  });

  test("skips entries without AniList or Kitsu sources", () => {
    const entries = [
      createEntry({ sources: ["https://myanimelist.net/anime/1"] }),
      createEntry({ sources: ["https://anidb.net/anime/1"] }),
    ];

    const plan = planInitialLoad(entries);

    expect(plan.toFetch).toHaveLength(0);
    expect(plan.toSkip).toHaveLength(2);
    expect(plan.toSkip[0].reason).toBe("no_sources");
  });

  test("includes entries with mixed sources", () => {
    const entries = [
      createEntry({ sources: ["https://anilist.co/anime/1", "https://myanimelist.net/anime/1"] }),
    ];

    const plan = planInitialLoad(entries);

    expect(plan.toFetch).toHaveLength(1);
    expect(plan.toFetch[0].providers).toContain("anilist");
    expect(plan.toFetch[0].providers).not.toContain("mal");
  });

  test("includes both AniList and Kitsu when available", () => {
    const entries = [
      createEntry({ sources: ["https://anilist.co/anime/1", "https://kitsu.app/anime/1"] }),
    ];

    const plan = planInitialLoad(entries);

    expect(plan.toFetch[0].providers).toContain("anilist");
    expect(plan.toFetch[0].providers).toContain("kitsu");
  });

  test("plans synthesize and embed for all fetched entries", () => {
    const entries = [
      createEntry({ sources: ["https://anilist.co/anime/1"] }),
      createEntry({ sources: ["https://anilist.co/anime/2"] }),
    ];

    const plan = planInitialLoad(entries);

    expect(plan.toSynthesize).toHaveLength(2);
    expect(plan.toEmbed).toHaveLength(2);
  });

  test("records correct stats", () => {
    const entries = [
      createEntry({ sources: ["https://anilist.co/anime/1"] }),
      createEntry({ sources: ["https://myanimelist.net/anime/2"] }),
    ];

    const plan = planInitialLoad(entries);

    expect(plan.stats.totalEntries).toBe(2);
    expect(plan.stats.newEntries).toBe(2);
    expect(plan.stats.changedEntries).toBe(0);
    expect(plan.stats.alreadyComplete).toBe(0);
  });

  test("handles empty input", () => {
    const plan = planInitialLoad([]);

    expect(plan.toFetch).toHaveLength(0);
    expect(plan.toSynthesize).toHaveLength(0);
    expect(plan.toEmbed).toHaveLength(0);
    expect(plan.toSkip).toHaveLength(0);
    expect(plan.stats.totalEntries).toBe(0);
  });
});
