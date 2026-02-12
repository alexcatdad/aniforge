import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { EMBEDDING_CONFIG } from "@anime-rag/core";

export interface Artifact {
  filename: string;
  size: number;
  sha256: string;
}

export interface BuildManifest {
  version: string;
  manamiVersion: string;
  buildDate: string;
  embeddingModel: string;
  embeddingDimensions: number;
  entryCount: number;
  artifacts: Artifact[];
}

export async function computeChecksum(filePath: string): Promise<string> {
  const file = Bun.file(filePath);
  const content = await file.arrayBuffer();
  return createHash("sha256").update(Buffer.from(content)).digest("hex");
}

export async function getArtifact(filePath: string): Promise<Artifact> {
  const stats = await stat(filePath);
  const filename = filePath.split("/").pop() ?? filePath;
  const sha256 = await computeChecksum(filePath);

  return {
    filename,
    size: stats.size,
    sha256,
  };
}

export async function generateManifest(
  version: string,
  manamiVersion: string,
  entryCount: number,
  artifactPaths: string[]
): Promise<BuildManifest> {
  const artifacts: Artifact[] = [];

  for (const path of artifactPaths) {
    artifacts.push(await getArtifact(path));
  }

  return {
    version,
    manamiVersion,
    buildDate: new Date().toISOString(),
    embeddingModel: EMBEDDING_CONFIG.model,
    embeddingDimensions: EMBEDDING_CONFIG.dimensions,
    entryCount,
    artifacts,
  };
}

export async function writeManifest(manifest: BuildManifest, outputPath: string): Promise<void> {
  await Bun.write(outputPath, JSON.stringify(manifest, null, 2));
}

export function parseVersion(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}.${month}.${day}`;
}
