import { describe, test, expect } from "bun:test";
import {
  cosineSimilarity,
  normalize,
  centroid,
  topK,
  truncate,
  jaccardSimilarity,
} from "./vector-ops";

describe("cosineSimilarity", () => {
  test("returns 1 for identical vectors", () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  test("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
  });

  test("returns -1 for opposite vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([-1, -2, -3]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
  });

  test("returns 0 for zero vectors", () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  test("throws for mismatched lengths", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([1, 2]);
    expect(() => cosineSimilarity(a, b)).toThrow();
  });

  test("handles floating point values", () => {
    const a = new Float32Array([0.5, 0.5, 0.5]);
    const b = new Float32Array([0.5, 0.5, 0.5]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 5);
  });
});

describe("normalize", () => {
  test("normalizes vector to unit length", () => {
    const v = new Float32Array([3, 4]);
    const result = normalize(v);
    expect(result[0]).toBeCloseTo(0.6, 5);
    expect(result[1]).toBeCloseTo(0.8, 5);
  });

  test("returns zero vector for zero input", () => {
    const v = new Float32Array([0, 0, 0]);
    const result = normalize(v);
    expect(result).toEqual(new Float32Array([0, 0, 0]));
  });

  test("does not mutate original vector", () => {
    const v = new Float32Array([3, 4]);
    normalize(v);
    expect(v[0]).toBe(3);
    expect(v[1]).toBe(4);
  });
});

describe("centroid", () => {
  test("computes mean of vectors", () => {
    const vectors = [
      new Float32Array([1, 2, 3]),
      new Float32Array([3, 4, 5]),
    ];
    const result = centroid(vectors);
    expect(result[0]).toBe(2);
    expect(result[1]).toBe(3);
    expect(result[2]).toBe(4);
  });

  test("handles single vector", () => {
    const vectors = [new Float32Array([1, 2, 3])];
    const result = centroid(vectors);
    expect(result).toEqual(new Float32Array([1, 2, 3]));
  });

  test("throws for empty array", () => {
    expect(() => centroid([])).toThrow();
  });
});

describe("topK", () => {
  test("returns top K results sorted by score", () => {
    const query = new Float32Array([1, 0, 0]);
    const corpus = [
      new Float32Array([1, 0, 0]),
      new Float32Array([0, 1, 0]),
      new Float32Array([0.9, 0.1, 0]),
    ];

    const result = topK(query, corpus, 2);

    expect(result).toHaveLength(2);
    expect(result[0].index).toBe(0);
    expect(result[0].score).toBeCloseTo(1, 5);
  });

  test("returns fewer results when k exceeds corpus size", () => {
    const query = new Float32Array([1, 0, 0]);
    const corpus = [new Float32Array([1, 0, 0])];

    const result = topK(query, corpus, 5);

    expect(result).toHaveLength(1);
  });

  test("handles empty corpus", () => {
    const query = new Float32Array([1, 0, 0]);
    const result = topK(query, [], 5);
    expect(result).toHaveLength(0);
  });
});

describe("truncate", () => {
  test("truncates vector to target dimension", () => {
    const v = new Float32Array(768).fill(1);
    const result = truncate(v, 256);
    expect(result.length).toBe(256);
  });

  test("valid dimension 128", () => {
    const v = new Float32Array(768).fill(1);
    const result = truncate(v, 128);
    expect(result.length).toBe(128);
  });

  test("throws for invalid dimension", () => {
    const v = new Float32Array(768);
    expect(() => truncate(v, 100)).toThrow();
  });
});

describe("jaccardSimilarity", () => {
  test("returns 1 for identical sets", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["a", "b", "c"]);
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  test("returns 0 for disjoint sets", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["c", "d"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });

  test("computes partial overlap", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["b", "c", "d"]);
    expect(jaccardSimilarity(a, b)).toBeCloseTo(0.5, 5);
  });

  test("returns 1 for two empty sets", () => {
    expect(jaccardSimilarity(new Set(), new Set())).toBe(1);
  });

  test("returns 0 for one empty set", () => {
    const a = new Set(["a", "b"]);
    expect(jaccardSimilarity(a, new Set())).toBe(0);
  });
});
