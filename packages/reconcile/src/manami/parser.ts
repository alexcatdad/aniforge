const MANAMI_DATABASE_URL =
  "https://github.com/manami-project/anime-offline-database/raw/master/anime-offline-database-minified.json";

export { MANAMI_DATABASE_URL };

import type { ManamiRelease } from "./types";

export async function downloadManami(url: string = MANAMI_DATABASE_URL): Promise<ManamiRelease> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download manami database: ${response.status}`);
  }
  return response.json() as Promise<ManamiRelease>;
}

export function parseManami(json: unknown): ManamiRelease {
  if (typeof json !== "object" || json === null) {
    throw new Error("Invalid manami JSON: expected object");
  }

  const release = json as ManamiRelease;

  if (!Array.isArray(release.data)) {
    throw new Error("Invalid manami JSON: expected data array");
  }

  return release;
}
