import { normalizeTags } from "@anime-rag/core";
import type { NormalizedTag, ProviderResponse } from "@anime-rag/core";

export { normalizeTags } from "@anime-rag/core";

export function mergeAndNormalizeTags(responses: ProviderResponse[]): NormalizedTag[] {
  const allTags: string[] = [];

  for (const response of responses) {
    if (response?.extracted.tags) {
      allTags.push(...response.extracted.tags);
    }
  }

  return normalizeTags(allTags);
}
