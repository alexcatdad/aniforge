import type { AnimeRecord } from "@anime-rag/core";
import { buildJsonl } from "./metadata/index";
import { buildParquet } from "./parquet/index";
import { type BuildManifest, generateManifest, parseVersion, writeManifest } from "./release";
import { type BuildInfo, buildSqlite } from "./sqlite/index";

export * from "./sqlite/index";
export * from "./parquet/index";
export * from "./metadata/index";
export * from "./release";

export interface BuildOptions {
  version?: string;
  manamiVersion: string;
  outputDir: string;
}

export async function buildAll(
  records: AnimeRecord[],
  vectors: Map<string, Float32Array>,
  options: BuildOptions
): Promise<BuildManifest> {
  const version = options.version ?? parseVersion();
  const sqlitePath = `${options.outputDir}/anime-rag.sqlite`;
  const parquetPath = `${options.outputDir}/embeddings.parquet`;
  const jsonlPath = `${options.outputDir}/metadata.jsonl.gz`;
  const manifestPath = `${options.outputDir}/manifest.json`;

  const buildInfo: BuildInfo = {
    version,
    manamiVersion: options.manamiVersion,
    buildDate: new Date().toISOString(),
    entryCount: records.length,
    embeddingModel: "nomic-ai/nomic-embed-text-v1.5",
    embeddingDimensions: 768,
  };

  buildSqlite(records, sqlitePath, buildInfo);

  await buildParquet(vectors, parquetPath);

  buildJsonl(records, jsonlPath);

  const manifest = await generateManifest(version, options.manamiVersion, records.length, [
    sqlitePath,
    parquetPath,
    jsonlPath,
  ]);

  await writeManifest(manifest, manifestPath);

  return manifest;
}
