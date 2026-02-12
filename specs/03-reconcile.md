# @anime-rag/reconcile — Specification

## Purpose

Consumes manami-project/anime-offline-database releases, diffs against previous versions, and determines what work the pipeline needs to do. This is the "what needs doing" layer — it never fetches or enriches data itself.

## Package Location

```
packages/reconcile/
├── src/
│   ├── manami/
│   │   ├── parser.ts          # Parse manami JSON release
│   │   ├── differ.ts          # Diff two manami releases
│   │   └── types.ts           # Manami-specific types
│   ├── id-mapper.ts           # Extract provider IDs from source URIs
│   ├── work-planner.ts        # Determine fetch/enrich/embed work
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Dependencies

- `@anime-rag/core` — types, provider URI patterns, pipeline state types

## Manami Release Format

The upstream dataset is a single JSON file released weekly at `https://github.com/manami-project/anime-offline-database/raw/master/anime-offline-database-minified.json`.

```typescript
interface ManamiRelease {
  license: { name: string; url: string };
  repository: string;
  lastUpdate: string;           // ISO date
  data: ManamiEntry[];
}

interface ManamiEntry {
  sources: string[];            // URIs to provider pages
  title: string;
  type: string;                 // TV, MOVIE, OVA, ONA, SPECIAL, UNKNOWN
  episodes: number;
  status: string;               // FINISHED, ONGOING, UPCOMING, UNKNOWN
  animeSeason: {
    season: string;             // SPRING, SUMMER, FALL, WINTER, UNDEFINED
    year: number | null;
  };
  picture: string;              // Thumbnail URL (not stored in our dataset)
  thumbnail: string;
  synonyms: string[];
  relations: string[];          // URIs to related anime
  tags: string[];
}
```

## Diffing Logic

Compare two manami releases to produce a changeset.

```typescript
interface Changeset {
  added: ManamiEntry[];         // Present in new, absent in previous
  removed: string[];            // Source URIs removed
  changed: {                    // Present in both, but properties differ
    entry: ManamiEntry;
    changedFields: string[];
  }[];
  unchanged: number;            // Count of unmodified entries
  previousVersion: string;      // lastUpdate of old release
  currentVersion: string;       // lastUpdate of new release
}
```

**Identity:** An entry is identified by its `sources` array (sorted, joined). If the sources match, compare title, type, episodes, status, season, tags. Any difference → `changed`.

**Typical weekly delta:** 20–50 new/changed entries.

## ID Mapping

Extract provider-specific IDs from manami source URIs using patterns from `@anime-rag/core`.

```typescript
function extractProviderIds(sources: string[]): Record<ProviderName, string | null> {
  // https://anilist.co/anime/5114 → { anilist: '5114' }
  // https://kitsu.app/anime/1376  → { kitsu: '1376' }
  // https://myanimelist.net/anime/5114 → { mal: '5114' }
  // etc.
}
```

This mapping is trivial because manami already resolved cross-references. The join is built into the dataset.

## Work Planning

Given a changeset and the current pipeline state DB, determine what operations each entry needs.

```typescript
interface WorkPlan {
  toFetch: {
    animeId: string;
    providers: ProviderName[];    // Which providers need (re-)fetching
  }[];
  toSynthesize: string[];         // Anime IDs with enough synopses for LLM
  toEmbed: string[];              // Anime IDs with updated canonical text
  toSkip: {                       // Entries with insufficient data
    animeId: string;
    reason: 'no_sources' | 'insufficient_synopses' | 'fetch_failed';
  }[];
  stats: {
    totalEntries: number;
    newEntries: number;
    changedEntries: number;
    alreadyComplete: number;
  };
}
```

**Decision rules:**

- New entry → fetch from all available providers.
- Changed entry (metadata only, e.g. episode count) → re-enrich, re-embed. No re-fetch unless tags changed.
- Changed entry (sources changed) → re-fetch affected providers.
- Entry with `synthesis_status: 'failed'` → retry synthesis.
- Entry with `synthesis_status: 'insufficient'` (0–1 synopses) → skip synthesis, use passthrough synopsis if available.
- Entry already `complete` and unchanged → skip entirely.

## Manami Merge Algorithm Reference

Manami uses a probabilistic matching algorithm to deduplicate entries across providers. Their implementation uses 6 properties with weighted Jaro-Winkler similarity and an 80% probability threshold. Understanding this helps explain why some entries map to multiple sources.

Properties compared: title (Jaro-Winkler), type (exact or SPECIAL/ONA fuzzy at 0.4), episodes (weighted, factor 4), status (binary), yearOfPremiere (weighted, factor 4), duration (scaled then weighted, factor 2).

We do not replicate this algorithm. We consume the already-merged output.

## State Integration

Reconcile reads from and writes to the intermediate state DB (managed by orchestrator). It updates the `manami_version` field and sets appropriate status flags to trigger downstream work.

## Operational Profile

| Metric | Initial Load | Weekly Run |
|--------|-------------|------------|
| Entries to process | ~30,000 | 20–50 |
| Diff computation | N/A (full load) | < 1 second |
| Work plan generation | < 1 second | < 100ms |
| Manami download | ~15 MB JSON | Same |
