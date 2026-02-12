import { describe, test, expect } from "bun:test";
import { validateLength, validateSimilarity, validateCoherence, validateSynopsis } from "./validation";

describe("validateLength", () => {
  test("passes for synopsis within bounds", () => {
    const synopsis = "word ".repeat(150);
    const result = validateLength(synopsis);
    expect(result.valid).toBe(true);
  });

  test("fails for too short synopsis", () => {
    const synopsis = "word ".repeat(50);
    const result = validateLength(synopsis);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Too short");
  });

  test("fails for too long synopsis", () => {
    const synopsis = "word ".repeat(600);
    const result = validateLength(synopsis);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Too long");
  });

  test("accepts minimum length", () => {
    const synopsis = "word ".repeat(100);
    const result = validateLength(synopsis);
    expect(result.valid).toBe(true);
  });

  test("accepts maximum length", () => {
    const synopsis = "word ".repeat(500);
    const result = validateLength(synopsis);
    expect(result.valid).toBe(true);
  });
});

describe("validateSimilarity", () => {
  test("passes for original synopsis", () => {
    const synopsis = "This is a completely original synopsis about anime characters.";
    const sources = ["A different synopsis about other things."];
    const result = validateSimilarity(synopsis, sources);
    expect(result.valid).toBe(true);
  });

  test("fails for too similar to source", () => {
    const synopsis = "The quick brown fox jumps over the lazy dog in the forest.";
    const sources = ["The quick brown fox jumps over the lazy dog in the meadow."];
    const result = validateSimilarity(synopsis, sources);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("Too similar");
  });

  test("checks against all sources", () => {
    const synopsis = "An original story about heroes.";
    const sources = [
      "A tale about brave warriors.",
      "A completely different narrative.",
    ];
    const result = validateSimilarity(synopsis, sources);
    expect(result.valid).toBe(true);
  });
});

describe("validateCoherence", () => {
  test("passes when title word appears in synopsis", () => {
    const synopsis = "Naruto is a young ninja who dreams of becoming Hokage.";
    const result = validateCoherence(synopsis, "Naruto");
    expect(result.valid).toBe(true);
  });

  test("passes for partial title match", () => {
    const synopsis = "The brotherhood of alchemists saves the world.";
    const result = validateCoherence(synopsis, "Fullmetal Alchemist Brotherhood");
    expect(result.valid).toBe(true);
  });

  test("fails when no title reference", () => {
    const synopsis = "A young hero goes on an adventure to save the world.";
    const result = validateCoherence(synopsis, "Naruto Shippuden");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("title");
  });
});

describe("validateSynopsis", () => {
  test("passes all validations", () => {
    const synopsis = "Test anime story word ".repeat(50);
    const sources = ["A completely different source text about other things."];
    const result = validateSynopsis(synopsis, sources, "Test Anime");
    expect(result.valid).toBe(true);
  });

  test("fails on length validation", () => {
    const synopsis = "short";
    const sources = ["Source text."];
    const result = validateSynopsis(synopsis, sources, "Test Anime");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("short");
  });
});
