import type { PipelineStats } from "@anime-rag/core";
import { buildAnimeId } from "@anime-rag/core";
import {
  type ManamiEntry,
  type ManamiRelease,
  diff,
  downloadManami,
  planInitialLoad,
  planWork,
} from "@anime-rag/reconcile";
import {
  completeRun,
  createRun,
  getIncompleteRun,
  getLastRun,
  upsertEntry,
} from "../state/index";
import {
  type PipelineConfig,
  runBuildStage,
  runEmbedStage,
  runFetchStage,
  runSynthesizeStage,
} from "./initial-load";

export interface RunResult {
  success: boolean;
  stats: PipelineStats;
  error?: string;
}

async function manamiToMap(release: ManamiRelease): Promise<Map<string, ManamiEntry>> {
  const map = new Map<string, ManamiEntry>();
  for (const entry of release.data) {
    const id = buildAnimeId(entry.sources);
    map.set(id, entry);
  }
  return map;
}

export async function runInitialLoad(config: PipelineConfig): Promise<RunResult> {
  const runId = crypto.randomUUID();
  const stats: PipelineStats = {
    totalEntries: 0,
    fetched: 0,
    synthesized: 0,
    embedded: 0,
    failed: 0,
    insufficient: 0,
  };

  try {
    const release = await downloadManami();
    createRun(config.stateDb, runId, "initial_load", release.lastUpdate);

    const manamiMap = await manamiToMap(release);
    const plan = planInitialLoad(release.data);

    stats.totalEntries = plan.stats.totalEntries;

    for (const task of plan.toFetch) {
      upsertEntry(config.stateDb, {
        animeId: task.animeId,
        manamiVersion: release.lastUpdate,
        fetchStatus: "pending",
      });
    }

    const pendingFetch = Array.from(manamiMap.entries())
      .filter(([id]) => plan.toFetch.some((t) => t.animeId === id))
      .map(([, entry]) => ({
        animeId: buildAnimeId(entry.sources),
        manamiVersion: release.lastUpdate,
        sources: {} as Record<string, null>,
        synopsisInputs: 0,
        fetchStatus: "pending" as const,
        synthesisStatus: "pending" as const,
        embeddingStatus: "pending" as const,
        canonicalText: null,
        errorLog: null,
        lastUpdated: new Date().toISOString(),
      }));

    for await (const result of runFetchStage(config, pendingFetch, manamiMap)) {
      if (result.status === "complete") stats.fetched++;
      else if (result.status === "failed") stats.failed++;
    }

    const pendingSynthesize = pendingFetch.filter((e) => e.fetchStatus === "complete");
    for await (const result of runSynthesizeStage(config, pendingSynthesize, manamiMap)) {
      if (result.status === "complete") stats.synthesized++;
      else if (result.status === "insufficient") stats.insufficient++;
    }

    const pendingEmbed = pendingSynthesize.filter((e) => e.synthesisStatus === "complete");
    for await (const result of runEmbedStage(config, pendingEmbed)) {
      if (result.status === "complete") stats.embedded++;
    }

    await runBuildStage(config, release.lastUpdate, manamiMap);

    completeRun(config.stateDb, runId, stats, "completed");

    return { success: true, stats };
  } catch (error) {
    completeRun(config.stateDb, runId, stats, "failed");
    return {
      success: false,
      stats,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function runWeeklyUpdate(config: PipelineConfig): Promise<RunResult> {
  const runId = crypto.randomUUID();
  const stats: PipelineStats = {
    totalEntries: 0,
    fetched: 0,
    synthesized: 0,
    embedded: 0,
    failed: 0,
    insufficient: 0,
  };

  try {
    const lastRun = getLastRun(config.stateDb);
    if (!lastRun) {
      throw new Error("No previous run found. Run initial-load first.");
    }

    const release = await downloadManami();
    createRun(config.stateDb, runId, "weekly_update", release.lastUpdate);

    const stateReader = async (animeId: string) => {
      const query = config.stateDb.prepare("SELECT * FROM pipeline_state WHERE anime_id = ?");
      const row = query.get(animeId) as Record<string, unknown> | null;
      if (!row) return null;
      return {
        animeId: row.anime_id as string,
        fetchStatus: row.fetch_status as "pending",
        synthesisStatus: row.synthesis_status as "pending",
        embeddingStatus: row.embedding_status as "pending",
        providerIds: {},
      };
    };

    const previousRelease: ManamiRelease = {
      license: { name: "", url: "" },
      repository: "",
      lastUpdate: lastRun.manamiVersion,
      data: [],
    };

    const changeset = diff(previousRelease, release);
    const plan = await planWork(changeset, stateReader);

    stats.totalEntries = plan.stats.totalEntries;

    const manamiMap = await manamiToMap(release);

    for (const entry of changeset.added) {
      upsertEntry(config.stateDb, {
        animeId: buildAnimeId(entry.sources),
        manamiVersion: release.lastUpdate,
        fetchStatus: "pending",
      });
    }

    const toFetch = changeset.added.map((entry) => ({
      animeId: buildAnimeId(entry.sources),
      manamiVersion: release.lastUpdate,
      sources: {} as Record<string, null>,
      synopsisInputs: 0,
      fetchStatus: "pending" as const,
      synthesisStatus: "pending" as const,
      embeddingStatus: "pending" as const,
      canonicalText: null,
      errorLog: null,
      lastUpdated: new Date().toISOString(),
    }));

    for await (const result of runFetchStage(config, toFetch, manamiMap)) {
      if (result.status === "complete") stats.fetched++;
    }

    for await (const result of runSynthesizeStage(config, toFetch, manamiMap)) {
      if (result.status === "complete") stats.synthesized++;
    }

    for await (const result of runEmbedStage(config, toFetch)) {
      if (result.status === "complete") stats.embedded++;
    }

    await runBuildStage(config, release.lastUpdate, manamiMap);

    completeRun(config.stateDb, runId, stats, "completed");

    return { success: true, stats };
  } catch (error) {
    completeRun(config.stateDb, runId, stats, "failed");
    return {
      success: false,
      stats,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function runResume(config: PipelineConfig): Promise<RunResult> {
  const incompleteRun = getIncompleteRun(config.stateDb);

  if (!incompleteRun) {
    return {
      success: false,
      stats: {
        totalEntries: 0,
        fetched: 0,
        synthesized: 0,
        embedded: 0,
        failed: 0,
        insufficient: 0,
      },
      error: "No incomplete run to resume",
    };
  }

  const release = await downloadManami();
  const manamiMap = await manamiToMap(release);

  const stats: PipelineStats = {
    totalEntries: 0,
    fetched: 0,
    synthesized: 0,
    embedded: 0,
    failed: 0,
    insufficient: 0,
  };

  const pendingFetch = Array.from(manamiMap.entries())
    .filter(([id]) => {
      const query = config.stateDb.prepare(
        "SELECT fetch_status FROM pipeline_state WHERE anime_id = ?"
      );
      const row = query.get(id) as { fetch_status: string } | null;
      return !row || row.fetch_status === "pending";
    })
    .map(([, entry]) => ({
      animeId: buildAnimeId(entry.sources),
      manamiVersion: release.lastUpdate,
      sources: {} as Record<string, null>,
      synopsisInputs: 0,
      fetchStatus: "pending" as const,
      synthesisStatus: "pending" as const,
      embeddingStatus: "pending" as const,
      canonicalText: null,
      errorLog: null,
      lastUpdated: new Date().toISOString(),
    }));

  for await (const result of runFetchStage(config, pendingFetch, manamiMap)) {
    if (result.status === "complete") stats.fetched++;
  }

  for await (const result of runSynthesizeStage(config, pendingFetch, manamiMap)) {
    if (result.status === "complete") stats.synthesized++;
  }

  for await (const result of runEmbedStage(config, pendingFetch)) {
    if (result.status === "complete") stats.embedded++;
  }

  await runBuildStage(config, release.lastUpdate, manamiMap);

  completeRun(config.stateDb, incompleteRun.runId, stats, "completed");

  return { success: true, stats };
}
