import { describe, test, expect } from "bun:test";
import { normalizeWhitespace, cleanText, truncateText, wordCount, isMinWords } from "./text";

describe("normalizeWhitespace", () => {
  test("trims leading and trailing whitespace", () => {
    expect(normalizeWhitespace("  hello world  ")).toBe("hello world");
  });

  test("collapses multiple spaces to single space", () => {
    expect(normalizeWhitespace("hello    world")).toBe("hello world");
  });

  test("collapses newlines and tabs to spaces", () => {
    expect(normalizeWhitespace("hello\n\nworld\ttest")).toBe("hello world test");
  });

  test("returns empty string for whitespace-only input", () => {
    expect(normalizeWhitespace("   \n\t  ")).toBe("");
  });
});

describe("cleanText", () => {
  test("strips HTML tags", () => {
    expect(cleanText("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  test("decodes HTML entities", () => {
    expect(cleanText("Hello &amp; goodbye")).toBe("Hello & goodbye");
    expect(cleanText("&lt;tag&gt;")).toBe("<tag>");
    expect(cleanText("&quot;text&quot;")).toBe('"text"');
  });

  test("handles &nbsp; entities", () => {
    expect(cleanText("Hello&nbsp;world")).toBe("Hello world");
  });

  test("normalizes whitespace after cleaning", () => {
    expect(cleanText("  <p>  Hello  </p>  ")).toBe("Hello");
  });
});

describe("truncateText", () => {
  test("returns original text if under max length", () => {
    expect(truncateText("hello", 10)).toBe("hello");
  });

  test("truncates with default ellipsis", () => {
    expect(truncateText("hello world", 8)).toBe("hello...");
  });

  test("truncates with custom ellipsis", () => {
    expect(truncateText("hello world", 10, "…")).toBe("hello wor…");
  });

  test("handles exact length", () => {
    expect(truncateText("hello", 5)).toBe("hello");
  });
});

describe("wordCount", () => {
  test("counts words correctly", () => {
    expect(wordCount("hello world test")).toBe(3);
  });

  test("handles multiple spaces", () => {
    expect(wordCount("hello    world")).toBe(2);
  });

  test("handles leading and trailing whitespace", () => {
    expect(wordCount("  hello world  ")).toBe(2);
  });

  test("returns 0 for empty string", () => {
    expect(wordCount("")).toBe(0);
  });

  test("returns 0 for whitespace-only string", () => {
    expect(wordCount("   ")).toBe(0);
  });
});

describe("isMinWords", () => {
  test("returns true when word count meets minimum", () => {
    expect(isMinWords("hello world test", 3)).toBe(true);
  });

  test("returns true when word count exceeds minimum", () => {
    expect(isMinWords("hello world test more", 3)).toBe(true);
  });

  test("returns false when word count below minimum", () => {
    expect(isMinWords("hello world", 3)).toBe(false);
  });

  test("returns true for minimum of 0", () => {
    expect(isMinWords("", 0)).toBe(true);
  });
});
