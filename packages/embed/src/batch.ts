import type { InfinityClient } from "./client";

export interface BatchConfig {
  batchSize: number;
  concurrency: number;
}

const DEFAULT_BATCH_CONFIG: BatchConfig = {
  batchSize: 128,
  concurrency: 4,
};

export async function embedBatch(
  client: InfinityClient,
  texts: string[],
  config: Partial<BatchConfig> = {}
): Promise<Float32Array[]> {
  const { batchSize, concurrency } = { ...DEFAULT_BATCH_CONFIG, ...config };

  if (texts.length === 0) return [];

  const chunks: string[][] = [];
  for (let i = 0; i < texts.length; i += batchSize) {
    chunks.push(texts.slice(i, i + batchSize));
  }

  const results: Float32Array[][] = new Array(chunks.length);
  const inFlight = new Set<Promise<void>>();

  for (let i = 0; i < chunks.length; i++) {
    while (inFlight.size >= concurrency) {
      await Promise.race(inFlight);
    }

    const chunk = chunks[i];
    const idx = i;
    const promise = (async () => {
      results[idx] = await client.embed(chunk);
    })().then(() => {
      inFlight.delete(promise);
    });

    inFlight.add(promise);
  }

  await Promise.all(inFlight);

  return results.flat();
}
