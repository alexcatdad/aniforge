import type { AnimeType } from "@anime-rag/core";

export interface SynthesisContext {
  title: string;
  type: AnimeType;
  episodes: number;
  year: number | null;
  synopses: string[];
}

export function buildSynthesisPrompt(context: SynthesisContext): string {
  const yearStr = context.year ? ` ${context.year}` : "";
  const synopsisBlock = context.synopses.map((s, i) => `Source ${i + 1}: ${s}`).join("\n\n");

  return `You are synthesizing anime synopses. You will receive multiple synopsis texts from different sources for the same anime. Your task:

1. Understand the core plot, characters, and setting from ALL sources.
2. Write a single, original synopsis in your own words (150-300 words).
3. Do NOT copy phrases or sentences from any source.
4. Capture key story elements, tone, and genre without spoilers.
5. Write in third person, present tense.

Anime: ${context.title} (${context.type}, ${context.episodes} episodes${yearStr})

Source synopses:
${synopsisBlock}

Write your synthesized synopsis:`;
}

export function buildPassthroughSynopsis(synopses: string[]): string {
  const validSynopses = synopses.filter((s) => s && s.trim().length >= 20);
  if (validSynopses.length === 0) return "";

  return validSynopses.reduce((longest, current) =>
    current.length > longest.length ? current : longest
  );
}
