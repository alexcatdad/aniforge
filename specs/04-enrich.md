# @anime-rag/enrich — Specification

## Purpose

Transforms raw multi-source provider data into enhanced records. Three responsibilities: taxonomy normalization, LLM synopsis synthesis, and canonical embedding text generation. This is the primary value-add layer — it produces the content that makes the dataset worth using.

## Package Location

```
packages/enrich/
├── src/
│   ├── taxonomy/
│   │   ├── normalizer.ts      # Tag/genre/theme normalization
│   │   └── lookup-table.ts    # Deterministic mapping data
│   ├── synthesis/
│   │   ├── synthesizer.ts     # LLM synopsis synthesis orchestration
│   │   ├── prompt.ts          # Prompt templates for synthesis
│   │   └── validation.ts      # Output quality checks
│   ├── canonical/
│   │   ├── builder.ts         # Canonical embedding text templating
│   │   └── template.ts        # Text template definition
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Dependencies

- `@anime-rag/core` — types, taxonomy constants, embedding config
- Anthropic SDK (`@anthropic-ai/sdk`) or OpenAI SDK (`openai`) — for LLM calls

## Taxonomy Normalization

Deterministic — no LLM involved. Maps provider-specific tags to a normalized taxonomy.

**Problem:** AniList uses "Sci-Fi", Kitsu uses "Science Fiction", MAL uses "Sci-Fi". Same concept, different strings. Tags also overlap across categories: "mecha" is both a genre and a theme depending on the provider.

**Solution:** A hand-curated lookup table in `@anime-rag/core` that maps all known provider tag variations to a normalized `{ category, value }` pair.

**Categories:**

- `genre` — broad classification (action, comedy, drama, romance, horror, etc.)
- `theme` — narrative/thematic elements (isekai, time_travel, superpowers, school, etc.)
- `demographic` — target audience (shounen, shoujo, seinen, josei, kids)
- `setting` — time/place (historical, futuristic, fantasy_world, urban, etc.)

**Process:**

1. Collect tags from all provider responses for an entry.
2. Deduplicate via lookup table.
3. Tags not in the lookup table → flagged for manual review and included as-is with `category: 'unmapped'`.
4. Output: sorted, deduplicated `NormalizedTag[]`.

## Synopsis Synthesis

The core enrichment step. Gathers synopses from multiple providers and uses an LLM to generate an original merged synopsis that captures the essence without copying any source text.

### Threshold Rules

- **3+ distinct synopses** (each ≥20 words) → synthesize via LLM. This matches the manami-project/modb-extension approach.
- **1–2 synopses** → passthrough the longest available synopsis. Mark `synthesis_status: 'insufficient'` but still usable.
- **0 synopses** → mark `synthesis_status: 'insufficient'`, leave `synopsis.synthesized` as null. Entry still gets embedded on metadata alone.

### Prompt Design

```typescript
const SYNTHESIS_PROMPT = `
You are synthesizing anime synopses. You will receive multiple synopsis texts 
from different sources for the same anime. Your task:

1. Understand the core plot, characters, and setting from ALL sources.
2. Write a single, original synopsis in your own words (150-300 words).
3. Do NOT copy phrases or sentences from any source.
4. Capture key story elements, tone, and genre without spoilers.
5. Write in third person, present tense.

Anime: {title} ({type}, {episodes} episodes, {year})

Source synopses:
{synopses}

Write your synthesized synopsis:
`;
```

### Quality Validation

Post-synthesis checks:

- **Length bounds:** 100–500 words. Reject and retry if outside.
- **Similarity check:** Compare against each source synopsis. If any source has >60% token overlap with the output, reject and retry with stricter prompt.
- **Coherence:** Basic check that the synopsis mentions the anime's title or main character.
- **Retries:** Max 2 retries per entry. After that, mark as `failed` for manual review.

### LLM Configuration

- **Model:** Remote API via existing plan (Anthropic Claude or OpenAI). Configurable.
- **Temperature:** 0.7 (creative enough to avoid copying, controlled enough for accuracy).
- **Max tokens:** 600 (hard cap for cost control).
- **Rate:** Existing generous limits. At 2–3s per entry, 30k entries = 17–25 hours wall time.

## Canonical Embedding Text

Generates the flattened text representation that gets embedded. This is the most critical quality decision — retrieval quality depends entirely on what goes into this text.

### Template

```typescript
function buildCanonicalText(record: AnimeRecord): string {
  const parts: string[] = [];

  // Title block
  parts.push(record.titles.canonical);
  if (record.titles.alternatives.length > 0) {
    parts.push(`Also known as: ${record.titles.alternatives.slice(0, 5).join(', ')}`);
  }

  // Classification
  parts.push(`${record.type}, ${record.episodes} episodes`);
  if (record.season.year) {
    parts.push(`${record.season.season ?? ''} ${record.season.year}`.trim());
  }

  // Tags (normalized)
  const genres = record.tags.filter(t => t.category === 'genre').map(t => t.value);
  const themes = record.tags.filter(t => t.category === 'theme').map(t => t.value);
  if (genres.length) parts.push(`Genres: ${genres.join(', ')}`);
  if (themes.length) parts.push(`Themes: ${themes.join(', ')}`);

  // Synopsis (the meat)
  if (record.synopsis.synthesized) {
    parts.push(record.synopsis.synthesized);
  }

  return parts.join('. ');
}
```

The synopsis dominates the embedding because it contains the richest semantic signal. Metadata (type, tags, year) provides structured grounding. Alternative titles help with multi-language retrieval.

### Embedding Prefix

When this text is embedded, the Infinity server should receive it with the Nomic document prefix: `search_document: {canonicalText}`. Query-time embeddings use `search_query: {userQuery}`. This distinction is critical for Nomic v1.5 performance.

## Output

Each entry processed by enrich produces an updated `AnimeRecord` with:

- `tags` — normalized taxonomy.
- `synopsis.synthesized` — LLM-generated or passthrough.
- `synopsis.sourceCount` — how many provider synopses were available.
- `canonicalEmbeddingText` — ready for embedding.

## Error Handling

- LLM timeout/error → retry once, then mark `synthesis_status: 'failed'`.
- LLM produces garbage (too short, too long, incoherent) → retry with adjusted prompt, then fail.
- Taxonomy lookup miss → include tag as `unmapped`, continue processing.
- Missing all fields (no title, no type, no tags) → mark entry as `insufficient`, skip canonical text generation.

## Operational Estimates

| Metric | Initial Load | Weekly Run |
|--------|-------------|------------|
| Entries to synthesize | ~20,000 (with 3+ synopses) | 10–30 |
| Entries passthrough | ~8,000 (1–2 synopses) | 5–15 |
| Entries skipped | ~2,000 (0 synopses) | 0–5 |
| LLM wall time | 17–25 hours | < 2 minutes |
| Taxonomy normalization | < 1 minute (deterministic) | < 1 second |
| Canonical text generation | < 1 minute (templating) | < 1 second |
