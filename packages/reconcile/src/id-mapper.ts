type ProviderName = "anilist" | "kitsu" | "mal" | "anidb";
type SourceURI = string;

const PROVIDER_PATTERNS: Record<ProviderName, RegExp> = {
  anilist: /^https:\/\/anilist\.co\/anime\/(\d+)$/,
  kitsu: /^https:\/\/kitsu\.app\/anime\/(\d+)$/,
  mal: /^https:\/\/myanimelist\.net\/anime\/(\d+)$/,
  anidb: /^https:\/\/anidb\.net\/anime\/(\d+)$/,
};

export function extractProviderId(uri: string): { provider: ProviderName; id: string } | null {
  for (const [provider, pattern] of Object.entries(PROVIDER_PATTERNS)) {
    const match = uri.match(pattern);
    if (match?.[1]) {
      return { provider: provider as ProviderName, id: match[1] };
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
    hashNum = ((hashNum << 5) - hashNum) + char;
    hashNum = hashNum & hashNum;
  }
  return Math.abs(hashNum).toString(36);
}

import type { ManamiEntry } from "./manami/types";

export function mapEntryToIds(entry: ManamiEntry): {
  animeId: string;
  providerIds: Record<ProviderName, string | null>;
} {
  return {
    animeId: buildAnimeId(entry.sources),
    providerIds: extractProviderIds(entry.sources),
  };
}

export function sourcesFromProviderIds(
  providerIds: Record<ProviderName, string | null>
): SourceURI[] {
  const sources: SourceURI[] = [];

  if (providerIds.anilist) {
    sources.push(`https://anilist.co/anime/${providerIds.anilist}`);
  }
  if (providerIds.kitsu) {
    sources.push(`https://kitsu.app/anime/${providerIds.kitsu}`);
  }
  if (providerIds.mal) {
    sources.push(`https://myanimelist.net/anime/${providerIds.mal}`);
  }
  if (providerIds.anidb) {
    sources.push(`https://anidb.net/anime/${providerIds.anidb}`);
  }

  return sources;
}
