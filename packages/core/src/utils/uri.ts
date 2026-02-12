import type { ProviderName } from "../types/provider";
import { PROVIDERS } from "../types/provider";

export function extractProviderId(uri: string): { provider: ProviderName; id: string } | null {
  for (const [provider, config] of Object.entries(PROVIDERS) as [
    ProviderName,
    (typeof PROVIDERS)[ProviderName],
  ][]) {
    const match = uri.match(config.uriPattern);
    if (match?.[1]) {
      return { provider, id: match[1] };
    }
  }
  return null;
}

export function extractProviderIds(uris: string[]): Record<ProviderName, string | null> {
  const result: Record<ProviderName, string | null> = {
    anilist: null,
    kitsu: null,
    mal: null,
    anidb: null,
  };

  for (const uri of uris) {
    const extracted = extractProviderId(uri);
    if (extracted) {
      result[extracted.provider] = extracted.id;
    }
  }

  return result;
}

export function buildAnimeId(sources: string[]): string {
  const sorted = [...sources].sort();
  const hash = sorted.join("|");
  let hashNum = 0;
  for (let i = 0; i < hash.length; i++) {
    const char = hash.charCodeAt(i);
    hashNum = (hashNum << 5) - hashNum + char;
    hashNum = hashNum & hashNum;
  }
  return Math.abs(hashNum).toString(36);
}
