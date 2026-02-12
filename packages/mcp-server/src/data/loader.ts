import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { type InfinityClient, createInfinityClient } from "@anime-rag/embed";

export interface ServerState {
  db: Database;
  vectors: Map<string, Float32Array>;
  client: InfinityClient | null;
  infinityAvailable: boolean;
}

export interface ServerConfig {
  sqlitePath: string;
  parquetPath: string;
  infinityUrl: string;
}

const DEFAULT_DATA_DIR = join(homedir(), ".local", "share", "anime-rag");

export function getDefaultConfig(): ServerConfig {
  return {
    sqlitePath: join(DEFAULT_DATA_DIR, "anime-rag.sqlite"),
    parquetPath: join(DEFAULT_DATA_DIR, "embeddings.parquet"),
    infinityUrl: process.env.INFINITY_URL ?? "http://localhost:7997",
  };
}

export async function initializeServer(config: ServerConfig): Promise<ServerState> {
  if (!existsSync(config.sqlitePath)) {
    throw new Error(
      `Database not found at ${config.sqlitePath}. Run 'anime-rag-mcp init' to download artifacts.`
    );
  }

  const db = new Database(config.sqlitePath, { readonly: true });

  const vectors = await loadVectors(config.parquetPath);

  const client = createInfinityClient({ baseUrl: config.infinityUrl });
  const infinityAvailable = await client.health();

  if (!infinityAvailable) {
    console.warn("Warning: Infinity server not available. Vector search disabled.");
  }

  return {
    db,
    vectors,
    client: infinityAvailable ? client : null,
    infinityAvailable,
  };
}

async function loadVectors(parquetPath: string): Promise<Map<string, Float32Array>> {
  if (!existsSync(parquetPath)) {
    console.warn(`Parquet file not found at ${parquetPath}. Vector search disabled.`);
    return new Map();
  }

  const { $ } = await import("bun");
  const result = await $`duckdb -c "SELECT id, embedding_768 FROM '${parquetPath}'" -json`.quiet();

  const rows = JSON.parse(result.stdout.toString()) as Array<{
    id: string;
    embedding_768: number[];
  }>;

  const vectors = new Map<string, Float32Array>();

  for (const row of rows) {
    vectors.set(row.id, new Float32Array(row.embedding_768));
  }

  return vectors;
}

export function closeServer(state: ServerState): void {
  state.db.close();
}
