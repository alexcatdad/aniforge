export function normalizeWhitespace(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

export function cleanText(text: string): string {
  return normalizeWhitespace(
    text
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
  );
}

export function truncateText(text: string, maxLength: number, ellipsis = "..."): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - ellipsis.length) + ellipsis;
}

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function isMinWords(text: string, minWords: number): boolean {
  return wordCount(text) >= minWords;
}
