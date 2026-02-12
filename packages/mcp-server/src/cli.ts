#!/usr/bin/env node
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { closeServer, getDefaultConfig, initializeServer } from "./data/loader";
import { runServer } from "./server";

const args = process.argv.slice(2);
const command = args[0];

const GITHUB_RELEASES_URL = "https://github.com/alexcatdad/anime-rag/releases";

async function downloadArtifacts(config: ReturnType<typeof getDefaultConfig>): Promise<void> {
  console.log("Downloading artifacts...");

  mkdirSync(dirname(config.sqlitePath), { recursive: true });

  console.log("Downloading anime-rag.sqlite...");
  const sqliteResp = await fetch(`${GITHUB_RELEASES_URL}/latest/download/anime-rag.sqlite`);
  if (!sqliteResp.ok) {
    throw new Error(`Failed to download SQLite: ${sqliteResp.status}`);
  }
  await Bun.write(config.sqlitePath, sqliteResp);

  console.log("Downloading embeddings.parquet...");
  const parquetResp = await fetch(`${GITHUB_RELEASES_URL}/latest/download/embeddings.parquet`);
  if (!parquetResp.ok) {
    throw new Error(`Failed to download parquet: ${parquetResp.status}`);
  }
  await Bun.write(config.parquetPath, parquetResp);

  console.log("Artifacts downloaded successfully!");
}

function printUsage(): void {
  console.log(`
anime-rag-mcp <command>

Commands:
  init    Download artifacts and initialize
  serve   Run the MCP server
  update  Check for and download newer artifacts

Environment:
  ANIME_RAG_DATA_DIR   Data directory for artifacts
  INFINITY_URL         Infinity embedding server URL (default: http://localhost:7997)
`);
}

async function main(): Promise<void> {
  const config = getDefaultConfig();

  if (!command || command === "help" || command === "--help") {
    printUsage();
    process.exit(0);
  }

  switch (command) {
    case "init": {
      if (existsSync(config.sqlitePath)) {
        console.log("Artifacts already exist. Use 'update' to refresh.");
        break;
      }
      await downloadArtifacts(config);
      break;
    }

    case "serve": {
      if (!existsSync(config.sqlitePath)) {
        console.error("Artifacts not found. Run 'anime-rag-mcp init' first.");
        process.exit(1);
      }

      const state = await initializeServer(config);

      try {
        await runServer(state);
      } finally {
        closeServer(state);
      }
      break;
    }

    case "update": {
      console.log("Checking for updates...");
      await downloadArtifacts(config);
      break;
    }

    default:
      console.error(`Unknown command: ${command}`);
      printUsage();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
