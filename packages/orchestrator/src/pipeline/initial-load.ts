import type { Database } from "bun:sqlite";
import { type BuildManifest, buildAll } from "@anime-rag/build";
import type { AnimeRecord, ProviderName, ProviderResponse } from "@anime-rag/core";
import { createInfinityClient, embedBatch } from "@anime-rag/embed";
import {
  type SynthesizerConfig,
  buildCanonicalTextFromData,
  mergeAndNormalizeTags,
  synthesize,
} from "@anime-rag/enrich";
import { type Fetcher, createFetcher } from "@anime-rag/ingest";
import { type ManamiEntry, buildAnimeId } from "@anime-rag/reconcile";
import type { StateEntry } from "../state/queries";
import { getEntriesByStatus, updateStatus, upsertEntry } from "../state/queries";
import type { StageResult } from "./stages";

export interface PipelineConfig {
  stateDb: Database;
  infinityUrl: string;
  llmConfig: SynthesizerConfig;
  outputDir: string;
  onProgress?: (stage: string, current: number, total: number, message?: string) => void;
}

function manamiEntryToAnimeRecord(
  entry: ManamiEntry,
  sources: Record<ProviderName, ProviderResponse | null>
): AnimeRecord {
  const responses = Object.values(sources).filter((r): r is ProviderResponse => r !== null);
  const tags = mergeAndNormalizeTags(responses);

  const title = responses[0]?.extracted.title ?? entry.title;
  const alternatives = [
    ...entry.synonyms,
    ...responses.flatMap((r) => [r.extracted.title]).filter((t): t is string => t !== title),
  ];

  const synopsis =
    responses.map((r) => r.extracted.synopsis).filter((s): s is string => s !== null)[0] ?? null;

  const year = responses[0]?.extracted.year ?? entry.animeSeason.year;
  const season = entry.animeSeason.season !== "UNDEFINED" ? entry.animeSeason.season : null;

  return {
    id: buildAnimeId(entry.sources),
    titles: { canonical: title, alternatives: [...new Set(alternatives)] },
    type: (responses[0]?.extracted.type as AnimeRecord["type"]) ?? "UNKNOWN",
    episodes: responses[0]?.extracted.episodes ?? entry.episodes,
    status: (responses[0]?.extracted.status as AnimeRecord["status"]) ?? "UNKNOWN",
    season: { year, season },
    duration: null,
    sources: entry.sources,
    tags,
    synopsis: {
      synthesized: synopsis,
      sourceCount: responses.filter((r) => r.extracted.synopsis).length,
    },
    thumbnail: entry.thumbnail,
    canonicalEmbeddingText: "",
  };
}

export async function* runFetchStage(
  config: PipelineConfig,
  entries: StateEntry[],
  manamiEntries: Map<string, ManamiEntry>
): AsyncGenerator<StageResult> {
  const fetchers: Record<ProviderName, Fetcher> = {
    anilist: createFetcher("anilist"),
    kitsu: createFetcher("kitsu"),
    mal: null as unknown as Fetcher,
    anidb: null as unknown as Fetcher,
  };

  const total = entries.length;
  let current = 0;

  for (const entry of entries) {
    const manamiEntry = manamiEntries.get(entry.animeId);
    if (!manamiEntry) {
      yield { animeId: entry.animeId, status: "failed", error: "Manami entry not found" };
      continue;
    }

    const sources: Record<ProviderName, ProviderResponse | null> = {
      anilist: null,
      kitsu: null,
      mal: null,
      anidb: null,
    };

    let synopsisCount = 0;

    for (const source of manamiEntry.sources) {
      const match = source.match(/https:\/\/(anilist|kitsu)\.co|app\/anime\/(\d+)/);
      if (!match) continue;

      const provider = match[1] as ProviderName;
      const id = source.split("/").pop() ?? "";

      try {
        if (provider === "anilist" || provider === "kitsu") {
          const fetcher = fetchers[provider];
          const response = await fetcher.fetchById(id);
          sources[provider] = response;
          if (response?.extracted.synopsis) synopsisCount++;
        }
      } catch (error) {
        console.error(`Failed to fetch ${provider}:${id}:`, error);
      }
    }

    upsertEntry(config.stateDb, {
      animeId: entry.animeId,
      sources,
      synopsisInputs: synopsisCount,
      fetchStatus: "complete",
    });

    current++;
    config.onProgress?.("fetch", current, total, manamiEntry.title);

    yield { animeId: entry.animeId, status: "complete", data: sources };
  }
}

export async function* runSynthesizeStage(
  config: PipelineConfig,
  entries: StateEntry[],
  manamiEntries: Map<string, ManamiEntry>
): AsyncGenerator<StageResult> {
  const total = entries.length;
  let current = 0;

  const llmCall = async (prompt: string, cfg: SynthesizerConfig): Promise<string> => {
    if (cfg.llmProvider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: cfg.maxTokens,
          temperature: cfg.temperature,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      const data = (await response.json()) as { content: { text: string }[] };
      return data.content[0]?.text ?? "";
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = (await response.json()) as { choices: { message: { content: string } }[] };
    return data.choices[0]?.message.content ?? "";
  };

  for (const entry of entries) {
    const manamiEntry = manamiEntries.get(entry.animeId);
    if (!manamiEntry) {
      yield { animeId: entry.animeId, status: "failed", error: "Manami entry not found" };
      continue;
    }

    const responses = Object.values(entry.sources).filter((r): r is ProviderResponse => r !== null);

    if (responses.length === 0) {
      updateStatus(config.stateDb, entry.animeId, "synthesis_status", "insufficient");
      yield { animeId: entry.animeId, status: "insufficient" };
      continue;
    }

    const result = await synthesize(
      responses,
      {
        title: manamiEntry.title,
        type: (responses[0]?.extracted.type as AnimeRecord["type"]) ?? "UNKNOWN",
        episodes: responses[0]?.extracted.episodes ?? manamiEntry.episodes,
        year: responses[0]?.extracted.year ?? manamiEntry.animeSeason.year,
      },
      config.llmConfig,
      llmCall
    );

    const canonicalText = buildCanonicalTextFromData({
      title: manamiEntry.title,
      alternatives: manamiEntry.synonyms,
      type: responses[0]?.extracted.type ?? "UNKNOWN",
      episodes: responses[0]?.extracted.episodes ?? manamiEntry.episodes,
      year: responses[0]?.extracted.year ?? manamiEntry.animeSeason.year,
      season:
        manamiEntry.animeSeason.season !== "UNDEFINED" ? manamiEntry.animeSeason.season : null,
      tags: mergeAndNormalizeTags(responses),
      synopsis: result.synopsis,
    });

    upsertEntry(config.stateDb, {
      animeId: entry.animeId,
      synthesisStatus: result.status,
      canonicalText,
    });

    current++;
    config.onProgress?.("synthesize", current, total, manamiEntry.title);

    yield { animeId: entry.animeId, status: result.status, error: result.error };
  }
}

export async function* runEmbedStage(
  config: PipelineConfig,
  entries: StateEntry[]
): AsyncGenerator<StageResult> {
  const client = createInfinityClient({ baseUrl: config.infinityUrl });
  const total = entries.length;
  let current = 0;

  const toEmbed = entries.filter((e) => e.canonicalText);

  if (toEmbed.length === 0) {
    for (const entry of entries) {
      yield { animeId: entry.animeId, status: "insufficient" };
    }
    return;
  }

  const texts = toEmbed.map((e) => e.canonicalText!);
  const vectors = await embedBatch(client, texts);

  const vectorMap = new Map<string, Float32Array>();
  for (let i = 0; i < toEmbed.length; i++) {
    vectorMap.set(toEmbed[i].animeId, vectors[i]);
  }

  for (const entry of entries) {
    if (vectorMap.has(entry.animeId)) {
      updateStatus(config.stateDb, entry.animeId, "embedding_status", "complete");
      current++;
      config.onProgress?.("embed", current, total);
      yield { animeId: entry.animeId, status: "complete", data: vectorMap.get(entry.animeId) };
    } else {
      updateStatus(config.stateDb, entry.animeId, "embedding_status", "insufficient");
      yield { animeId: entry.animeId, status: "insufficient" };
    }
  }
}

export async function runBuildStage(
  config: PipelineConfig,
  manamiVersion: string,
  manamiEntries: Map<string, ManamiEntry>
): Promise<BuildManifest> {
  const entries = getEntriesByStatus(config.stateDb, "embedding_status", "complete");

  const records: AnimeRecord[] = [];
  const vectors = new Map<string, Float32Array>();

  const client = createInfinityClient({ baseUrl: config.infinityUrl });

  for (const entry of entries) {
    const manamiEntry = manamiEntries.get(entry.animeId);
    if (!manamiEntry) continue;

    const record = manamiEntryToAnimeRecord(manamiEntry, entry.sources);
    record.canonicalEmbeddingText = entry.canonicalText ?? "";
    records.push(record);

    if (entry.canonicalText) {
      const vecs = await client.embed([entry.canonicalText]);
      vectors.set(entry.animeId, vecs[0]);
    }
  }

  return buildAll(records, vectors, {
    manamiVersion,
    outputDir: config.outputDir,
  });
}
