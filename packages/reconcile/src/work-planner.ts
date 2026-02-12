import { mapEntryToIds } from "./id-mapper";
import type { Changeset } from "./manami/differ";
import type { ManamiEntry } from "./manami/types";

type ProviderName = "anilist" | "kitsu" | "mal" | "anidb";
type PipelineStatus = "pending" | "in_progress" | "complete" | "failed" | "insufficient";

export interface FetchTask {
  animeId: string;
  providers: ProviderName[];
}

export interface WorkPlan {
  toFetch: FetchTask[];
  toSynthesize: string[];
  toEmbed: string[];
  toSkip: {
    animeId: string;
    reason: "no_sources" | "insufficient_synopses" | "fetch_failed";
  }[];
  stats: {
    totalEntries: number;
    newEntries: number;
    changedEntries: number;
    alreadyComplete: number;
  };
}

interface PipelineStateEntry {
  animeId: string;
  fetchStatus: PipelineStatus;
  synthesisStatus: PipelineStatus;
  embeddingStatus: PipelineStatus;
  providerIds: Record<ProviderName, string | null>;
}

type PipelineStateReader = (animeId: string) => Promise<PipelineStateEntry | null>;

function getAvailableProviders(entry: ManamiEntry): ProviderName[] {
  const { providerIds } = mapEntryToIds(entry);
  const providers: ProviderName[] = [];

  if (providerIds.anilist) providers.push("anilist");
  if (providerIds.kitsu) providers.push("kitsu");

  return providers;
}

function needsRefetch(changedFields: string[]): boolean {
  return changedFields.includes("sources") || changedFields.includes("tags");
}

export async function planWork(
  changeset: Changeset,
  stateReader: PipelineStateReader
): Promise<WorkPlan> {
  const toFetch: FetchTask[] = [];
  const toSynthesize: string[] = [];
  const toEmbed: string[] = [];
  const toSkip: WorkPlan["toSkip"] = [];

  let alreadyComplete = 0;

  for (const entry of changeset.added) {
    const { animeId } = mapEntryToIds(entry);
    const providers = getAvailableProviders(entry);

    if (providers.length === 0) {
      toSkip.push({ animeId, reason: "no_sources" });
      continue;
    }

    toFetch.push({ animeId, providers });
  }

  for (const { entry, changedFields } of changeset.changed) {
    const { animeId } = mapEntryToIds(entry);
    const state = await stateReader(animeId);

    if (needsRefetch(changedFields)) {
      const providers = getAvailableProviders(entry);
      if (providers.length > 0) {
        toFetch.push({ animeId, providers });
      } else {
        toSkip.push({ animeId, reason: "no_sources" });
      }
    } else if (state) {
      if (state.synthesisStatus === "failed") {
        toSynthesize.push(animeId);
      }
      if (state.embeddingStatus === "failed") {
        toEmbed.push(animeId);
      }
      if (state.synthesisStatus === "complete" && state.embeddingStatus === "complete") {
        alreadyComplete++;
      }
    }
  }

  return {
    toFetch,
    toSynthesize,
    toEmbed,
    toSkip,
    stats: {
      totalEntries: changeset.added.length + changeset.changed.length + changeset.unchanged,
      newEntries: changeset.added.length,
      changedEntries: changeset.changed.length,
      alreadyComplete,
    },
  };
}

export function planInitialLoad(entries: ManamiEntry[]): WorkPlan {
  const toFetch: FetchTask[] = [];
  const toSkip: WorkPlan["toSkip"] = [];

  for (const entry of entries) {
    const { animeId } = mapEntryToIds(entry);
    const providers = getAvailableProviders(entry);

    if (providers.length === 0) {
      toSkip.push({ animeId, reason: "no_sources" });
      continue;
    }

    toFetch.push({ animeId, providers });
  }

  return {
    toFetch,
    toSynthesize: toFetch.map((t) => t.animeId),
    toEmbed: toFetch.map((t) => t.animeId),
    toSkip,
    stats: {
      totalEntries: entries.length,
      newEntries: entries.length,
      changedEntries: 0,
      alreadyComplete: 0,
    },
  };
}
