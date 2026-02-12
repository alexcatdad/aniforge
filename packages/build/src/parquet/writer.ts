import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

export interface ParquetBuildOptions {
  outputPath: string;
  tempDir?: string;
}

interface EmbeddingRow {
  id: string;
  embedding_768: number[];
  embedding_256: number[];
}

async function writeTempNdjson(rows: EmbeddingRow[], tempDir: string): Promise<string> {
  const tempPath = join(tempDir, `embeddings-${Date.now()}.ndjson`);

  const lines = rows.map((row) => JSON.stringify(row));
  await Bun.write(tempPath, lines.join("\n"));

  return tempPath;
}

export async function buildParquet(
  vectors: Map<string, Float32Array>,
  outputPath: string
): Promise<void> {
  const tempDir = tmpdir();
  mkdirSync(outputPath.substring(0, outputPath.lastIndexOf("/")), { recursive: true });

  const rows: EmbeddingRow[] = [];

  for (const [id, vector] of vectors) {
    const embedding768 = Array.from(vector);
    const embedding256 = Array.from(vector.slice(0, 256));

    rows.push({
      id,
      embedding_768: embedding768,
      embedding_256: embedding256,
    });
  }

  const tempFile = await writeTempNdjson(rows, tempDir);

  try {
    await $`duckdb -c "COPY (SELECT * FROM read_ndjson('${tempFile}')) TO '${outputPath}' (FORMAT PARQUET, COMPRESSION SNAPPY)"`.quiet();
  } finally {
    if (existsSync(tempFile)) {
      unlinkSync(tempFile);
    }
  }
}
