import type { ManamiEntry } from "./types";

export interface ChangedEntry {
  entry: ManamiEntry;
  changedFields: string[];
}

export interface Changeset {
  added: ManamiEntry[];
  removed: string[];
  changed: ChangedEntry[];
  unchanged: number;
  previousVersion: string;
  currentVersion: string;
}

function entryIdentity(entry: ManamiEntry): string {
  return [...entry.sources].sort().join("|");
}

function compareEntries(a: ManamiEntry, b: ManamiEntry): string[] {
  const changed: string[] = [];

  if (a.title !== b.title) changed.push("title");
  if (a.type !== b.type) changed.push("type");
  if (a.episodes !== b.episodes) changed.push("episodes");
  if (a.status !== b.status) changed.push("status");
  if (a.animeSeason.season !== b.animeSeason.season) changed.push("season");
  if (a.animeSeason.year !== b.animeSeason.year) changed.push("year");

  const tagsA = [...a.tags].sort().join(",");
  const tagsB = [...b.tags].sort().join(",");
  if (tagsA !== tagsB) changed.push("tags");

  const sourcesA = [...a.sources].sort().join(",");
  const sourcesB = [...b.sources].sort().join(",");
  if (sourcesA !== sourcesB) changed.push("sources");

  return changed;
}

export function diff(previous: ManamiRelease | null, current: ManamiRelease): Changeset {
  if (!previous) {
    return {
      added: current.data,
      removed: [],
      changed: [],
      unchanged: 0,
      previousVersion: "",
      currentVersion: current.lastUpdate,
    };
  }

  const previousMap = new Map<string, ManamiEntry>();
  for (const entry of previous.data) {
    previousMap.set(entryIdentity(entry), entry);
  }

  const currentMap = new Map<string, ManamiEntry>();
  for (const entry of current.data) {
    currentMap.set(entryIdentity(entry), entry);
  }

  const added: ManamiEntry[] = [];
  const removed: string[] = [];
  const changed: ChangedEntry[] = [];
  let unchanged = 0;

  for (const [identity, entry] of currentMap) {
    const prevEntry = previousMap.get(identity);
    if (!prevEntry) {
      added.push(entry);
    } else {
      const changedFields = compareEntries(prevEntry, entry);
      if (changedFields.length > 0) {
        changed.push({ entry, changedFields });
      } else {
        unchanged++;
      }
    }
  }

  for (const [identity, entry] of previousMap) {
    if (!currentMap.has(identity)) {
      removed.push(entryIdentity(entry));
    }
  }

  return {
    added,
    removed,
    changed,
    unchanged,
    previousVersion: previous.lastUpdate,
    currentVersion: current.lastUpdate,
  };
}
