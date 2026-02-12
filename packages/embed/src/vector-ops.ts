const MATRYOSHKA_DIMENSIONS = [64, 128, 256, 512, 768] as const;

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same length");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function normalize(v: Float32Array): Float32Array {
  let norm = 0;
  for (let i = 0; i < v.length; i++) {
    norm += v[i] * v[i];
  }
  norm = Math.sqrt(norm);

  if (norm === 0) return new Float32Array(v.length);

  const result = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) {
    result[i] = v[i] / norm;
  }

  return result;
}

export function centroid(vectors: Float32Array[]): Float32Array {
  if (vectors.length === 0) {
    throw new Error("Cannot compute centroid of empty array");
  }

  const dims = vectors[0].length;
  const result = new Float32Array(dims);

  for (const v of vectors) {
    for (let i = 0; i < dims; i++) {
      result[i] += v[i];
    }
  }

  for (let i = 0; i < dims; i++) {
    result[i] /= vectors.length;
  }

  return result;
}

export interface TopKResult {
  index: number;
  score: number;
}

export function topK(query: Float32Array, corpus: Float32Array[], k: number): TopKResult[] {
  const scores: TopKResult[] = corpus.map((v, i) => ({
    index: i,
    score: cosineSimilarity(query, v),
  }));

  scores.sort((a, b) => b.score - a.score);

  return scores.slice(0, k);
}

export function truncate(vector: Float32Array, targetDim: number): Float32Array {
  if (!MATRYOSHKA_DIMENSIONS.includes(targetDim as (typeof MATRYOSHKA_DIMENSIONS)[number])) {
    throw new Error(
      `Invalid dimension ${targetDim}. Must be one of: ${MATRYOSHKA_DIMENSIONS.join(", ")}`
    );
  }

  return vector.slice(0, targetDim);
}

export function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return intersection / union;
}
