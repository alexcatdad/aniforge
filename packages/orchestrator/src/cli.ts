#!/usr/bin/env node
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig, getSynthesizerConfig } from "./config";
import { runInitialLoad, runResume, runWeeklyUpdate } from "./pipeline/index";
import { createStateDatabase } from "./state/index";

const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.log(`
anime-rag pipeline <command>

Commands:
  initial-load    Run full corpus build
  weekly-update   Run incremental update
  resume          Resume interrupted run
  status          Show current pipeline state
  reset           Reset entries for re-processing

Environment:
  STATE_DB_PATH   Path to state database (default: ./data/intermediate/state.sqlite)
  OUTPUT_DIR      Output directory for artifacts (default: ./data/artifacts)
  INFINITY_URL    Infinity embedding server URL (default: http://localhost:7997)
  LLM_PROVIDER    LLM provider: anthropic or openai (default: anthropic)
  LLM_MODEL       LLM model name (default: claude-3-haiku-20240307)
  ANTHROPIC_API_KEY   Anthropic API key
  OPENAI_API_KEY      OpenAI API key
`);
}

async function main(): Promise<void> {
  if (!command || command === "help" || command === "--help") {
    printUsage();
    process.exit(0);
  }

  const config = getConfig();
  mkdirSync(dirname(config.stateDbPath), { recursive: true });
  mkdirSync(config.outputDir, { recursive: true });

  const db = createStateDatabase(config.stateDbPath);
  const llmConfig = getSynthesizerConfig(config);

  const pipelineConfig = {
    stateDb: db,
    infinityUrl: config.infinityUrl,
    llmConfig,
    outputDir: config.outputDir,
    onProgress: (stage: string, current: number, total: number, message?: string) => {
      const pct = ((current / total) * 100).toFixed(1);
      console.log(`[${stage}] ${current}/${total} (${pct}%)${message ? ` - ${message}` : ""}`);
    },
  };

  try {
    switch (command) {
      case "initial-load": {
        console.log("Starting initial load...");
        const result = await runInitialLoad(pipelineConfig);
        console.log(result.success ? "Initial load complete!" : `Failed: ${result.error}`);
        console.log("Stats:", JSON.stringify(result.stats, null, 2));
        break;
      }

      case "weekly-update": {
        console.log("Starting weekly update...");
        const result = await runWeeklyUpdate(pipelineConfig);
        console.log(result.success ? "Weekly update complete!" : `Failed: ${result.error}`);
        console.log("Stats:", JSON.stringify(result.stats, null, 2));
        break;
      }

      case "resume": {
        console.log("Resuming...");
        const result = await runResume(pipelineConfig);
        console.log(result.success ? "Resume complete!" : `Failed: ${result.error}`);
        console.log("Stats:", JSON.stringify(result.stats, null, 2));
        break;
      }

      case "status": {
        const query = db.prepare(
          "SELECT COUNT(*) as count, fetch_status FROM pipeline_state GROUP BY fetch_status"
        );
        const rows = query.all() as { count: number; fetch_status: string }[];
        console.log("Pipeline status:");
        for (const row of rows) {
          console.log(`  ${row.fetch_status}: ${row.count}`);
        }
        break;
      }

      case "reset": {
        const stage = args[1];
        if (stage) {
          db.exec(`UPDATE pipeline_state SET ${stage}_status = 'pending'`);
          console.log(`Reset ${stage} stage for all entries.`);
        } else {
          db.exec(
            "UPDATE pipeline_state SET fetch_status = 'pending', synthesis_status = 'pending', embedding_status = 'pending'"
          );
          console.log("Reset all stages for all entries.");
        }
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        printUsage();
        process.exit(1);
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
