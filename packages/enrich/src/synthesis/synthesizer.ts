import type { ProviderResponse } from "@anime-rag/core";
import { wordCount } from "@anime-rag/core";
import { type SynthesisContext, buildPassthroughSynopsis, buildSynthesisPrompt } from "./prompt";
import { validateSynopsis } from "./validation";

export interface SynthesisResult {
  synopsis: string | null;
  sourceCount: number;
  status: "complete" | "insufficient" | "failed";
  error?: string;
}

export interface SynthesizerConfig {
  llmProvider: "anthropic" | "openai";
  model: string;
  apiKey: string;
  maxRetries: number;
  temperature: number;
  maxTokens: number;
}

const MIN_SYNOPSIS_WORDS = 20;
const MIN_SOURCES_FOR_SYNTHESIS = 3;

function extractSynopses(responses: ProviderResponse[]): string[] {
  return responses
    .map((r) => r.extracted.synopsis)
    .filter((s): s is string => s !== null && wordCount(s) >= MIN_SYNOPSIS_WORDS);
}

export async function synthesize(
  responses: ProviderResponse[],
  context: Omit<SynthesisContext, "synopses">,
  config: SynthesizerConfig,
  llmCall: (prompt: string, config: SynthesizerConfig) => Promise<string>
): Promise<SynthesisResult> {
  const synopses = extractSynopses(responses);

  if (synopses.length === 0) {
    return {
      synopsis: null,
      sourceCount: 0,
      status: "insufficient",
    };
  }

  if (synopses.length < MIN_SOURCES_FOR_SYNTHESIS) {
    const passthrough = buildPassthroughSynopsis(synopses);
    return {
      synopsis: passthrough || null,
      sourceCount: synopses.length,
      status: "insufficient",
    };
  }

  const fullContext: SynthesisContext = { ...context, synopses };
  const prompt = buildSynthesisPrompt(fullContext);

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      const generated = await llmCall(prompt, config);
      const validation = validateSynopsis(generated, synopses, context.title);

      if (validation.valid) {
        return {
          synopsis: generated.trim(),
          sourceCount: synopses.length,
          status: "complete",
        };
      }

      if (attempt === config.maxRetries) {
        return {
          synopsis: buildPassthroughSynopsis(synopses),
          sourceCount: synopses.length,
          status: "failed",
          error: validation.reason,
        };
      }
    } catch (error) {
      if (attempt === config.maxRetries) {
        return {
          synopsis: buildPassthroughSynopsis(synopses),
          sourceCount: synopses.length,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }
  }

  return {
    synopsis: buildPassthroughSynopsis(synopses),
    sourceCount: synopses.length,
    status: "failed",
    error: "Max retries exceeded",
  };
}
