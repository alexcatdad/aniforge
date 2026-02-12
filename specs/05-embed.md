# @anime-rag/embed — Specification

## Purpose

Typed HTTP client for the Infinity embedding server. Accepts canonical embedding text, returns 768-dimensional vectors. This is a thin wrapper around a `fetch` call — the heavy lifting happens in Infinity.

## Package Location

```
packages/embed/
├── src/
│   ├── client.ts              # Infinity HTTP client
│   ├── batch.ts               # Batched embedding with chunking
│   ├── vector-ops.ts          # Cosine similarity, centroid computation
│   └── index.ts
├── package.json
└── tsconfig.json
```

## Dependencies

- `@anime-rag/core` — embedding config (model name, dimensions, prefixes)

## Infinity Client

Infinity exposes an OpenAI-compatible `/embeddings` endpoint. The client is a typed wrapper.

```typescript
interface InfinityClient {
  embed(texts: string[], prefix?: 'search_query' | 'search_document'): Promise<Float32Array[]>;
  health(): Promise<boolean>;
}

interface InfinityConfig {
  baseUrl: string;              // e.g. 'http://localhost:7997'
  model: string;                // 'nomic-ai/nomic-embed-text-v1.5'
  batchSize: number;            // Max texts per request (default: 128)
  timeoutMs: number;            // Per-request timeout (default: 30000)
}
```

### Request Format

```typescript
// POST {baseUrl}/embeddings
{
  "input": ["search_document: Fullmetal Alchemist. TV, 64 episodes..."],
  "model": "nomic-ai/nomic-embed-text-v1.5"
}
```

### Response Format

```typescript
{
  "data": [
    { "embedding": [0.123, -0.456, ...], "index": 0 }
  ],
  "model": "nomic-ai/nomic-embed-text-v1.5",
  "usage": { "prompt_tokens": 42, "total_tokens": 42 }
}
```

## Batch Processing

For the initial load of 30k entries, texts are chunked into batches to avoid overwhelming Infinity or hitting memory limits.

```typescript
async function embedBatch(
  client: InfinityClient,
  texts: string[],
  options: { batchSize?: number; concurrency?: number }
): Promise<Float32Array[]> {
  // Chunk texts into groups of batchSize
  // Process up to `concurrency` chunks in parallel
  // Concatenate results maintaining original order
  // Return flat array of vectors
}
```

**Defaults:** batch size 128, concurrency 4. At these settings, 30k entries completes in minutes on a local Infinity instance. Infinity handles dynamic batching and tokenization internally, so the client-side batching is primarily for memory management.

## Nomic v1.5 Task Prefixes

Critical for model performance. Nomic Embed v1.5 uses task-specific prefixes:

- **Documents (pipeline time):** `search_document: {text}` — applied to canonical embedding text when building the index.
- **Queries (runtime):** `search_query: {text}` — applied to user queries in the MCP server.

The embed package applies the appropriate prefix before sending to Infinity. Callers specify intent, not the raw prefix string.

```typescript
// Pipeline usage
const vectors = await client.embed(canonicalTexts, 'search_document');

// MCP server query-time usage
const queryVector = await client.embed([userQuery], 'search_query');
```

## Vector Operations

Lightweight math utilities. No FAISS dependency — 30k × 768 is small enough for brute-force.

```typescript
/** Cosine similarity between two vectors */
function cosineSimilarity(a: Float32Array, b: Float32Array): number;

/** Compute centroid (mean) of multiple vectors */
function centroid(vectors: Float32Array[]): Float32Array;

/** Find top-k nearest neighbors by cosine similarity */
function topK(
  query: Float32Array,
  corpus: Float32Array[],
  k: number
): { index: number; score: number }[];

/** Normalize a vector to unit length */
function normalize(v: Float32Array): Float32Array;
```

**Performance note:** 30k × 768 brute-force cosine similarity search completes in under 10ms on modern hardware. FAISS or HNSW indexing is unnecessary at this scale and would add complexity without meaningful benefit.

## Matryoshka Truncation

Nomic v1.5 supports Matryoshka representation learning — vectors can be truncated to lower dimensions while preserving semantic quality. This is useful for storage-constrained deployments.

```typescript
function truncate(vector: Float32Array, targetDim: number): Float32Array {
  return vector.slice(0, targetDim);
}
```

Supported dimensions from EMBEDDING_CONFIG: 64, 128, 256, 512, 768. The build package may produce embeddings at multiple dimensions for different distribution tiers.

## Runtime Considerations

This package is used in two contexts:

1. **Pipeline (batch):** Embedding 30k canonical texts during initial load or weekly delta. High throughput, batch-oriented. Infinity is warm and loaded.

2. **MCP server (query-time):** Embedding a single user query on each search/recommend call. Latency-sensitive. Requires Infinity to be running alongside the MCP server, OR the MCP server falls back to FTS-only search if Infinity is unavailable.

The client handles both gracefully. For the MCP server, a health check on startup determines if Infinity is reachable. If not, vector search is disabled and the server operates in FTS-only mode.

## Error Handling

- Infinity unreachable → throw on pipeline, degrade gracefully on MCP server.
- Timeout → retry once with doubled timeout, then fail the batch.
- Mismatched dimensions in response → fatal error, model mismatch.
- Empty input → return empty array, no API call.

## Operational Estimates

| Metric | Initial Load | Weekly Delta | MCP Query |
|--------|-------------|-------------|-----------|
| Entries | ~30,000 | 20–50 | 1 |
| Wall time | 2–5 minutes | < 5 seconds | < 50ms |
| Infinity load | High throughput | Negligible | Single request |
