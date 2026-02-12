export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

const MIN_WORDS = 100;
const MAX_WORDS = 500;
const MAX_SIMILARITY = 0.6;

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function validateLength(synopsis: string): ValidationResult {
  const words = wordCount(synopsis);

  if (words < MIN_WORDS) {
    return { valid: false, reason: `Too short: ${words} words (min ${MIN_WORDS})` };
  }

  if (words > MAX_WORDS) {
    return { valid: false, reason: `Too long: ${words} words (max ${MAX_WORDS})` };
  }

  return { valid: true };
}

export function validateSimilarity(synopsis: string, sources: string[]): ValidationResult {
  const synopsisTokens = tokenize(synopsis.toLowerCase());

  for (const source of sources) {
    const sourceTokens = tokenize(source.toLowerCase());
    const sourceSet = new Set(sourceTokens);

    const intersection = synopsisTokens.filter((t) => sourceSet.has(t)).length;
    const union = new Set([...synopsisTokens, ...sourceTokens]).size;

    const similarity = intersection / union;

    if (similarity > MAX_SIMILARITY) {
      return {
        valid: false,
        reason: `Too similar to source (${(similarity * 100).toFixed(1)}% overlap, max ${MAX_SIMILARITY * 100}%)`,
      };
    }
  }

  return { valid: true };
}

export function validateCoherence(synopsis: string, title: string): ValidationResult {
  const lowerSynopsis = synopsis.toLowerCase();
  const lowerTitle = title.toLowerCase();

  const titleWords = lowerTitle.split(/\s+/).filter((w) => w.length > 3);
  const hasTitleWord = titleWords.some((w) => lowerSynopsis.includes(w));

  if (!hasTitleWord && titleWords.length > 0) {
    return { valid: false, reason: "Synopsis doesn't reference the anime title" };
  }

  return { valid: true };
}

export function validateSynopsis(
  synopsis: string,
  sources: string[],
  title: string
): ValidationResult {
  const lengthResult = validateLength(synopsis);
  if (!lengthResult.valid) return lengthResult;

  const similarityResult = validateSimilarity(synopsis, sources);
  if (!similarityResult.valid) return similarityResult;

  const coherenceResult = validateCoherence(synopsis, title);
  if (!coherenceResult.valid) return coherenceResult;

  return { valid: true };
}

function tokenize(text: string): string[] {
  return text
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 2);
}
