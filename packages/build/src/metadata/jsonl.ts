import { gzipSync } from "node:zlib";
import type { AnimeRecord } from "@anime-rag/core";

export function buildJsonl(records: AnimeRecord[], outputPath: string): void {
  const lines = records.map((r) => JSON.stringify(r));
  const content = lines.join("\n");

  if (outputPath.endsWith(".gz")) {
    const compressed = gzipSync(Buffer.from(content));
    Bun.write(outputPath, compressed);
  } else {
    Bun.write(outputPath, content);
  }
}
