import {
  compareNewestSavedRunFirst,
  nextPageCursor,
  normalizeRunForPersistence,
  parsePageOffset,
} from "./run-persistence";
import type { GenerationRun, RunRepository } from "./types";

type OwnerRuns = Map<string, GenerationRun>;

// Process-lifetime store shared across requests. It backs local fixture
// development (no Supabase configured): runs survive a browser reload because
// the Node server keeps the map, while cross-device continuity needs Supabase.
const sharedRunsByOwner = new Map<string, OwnerRuns>();

/**
 * An owner-scoped {@link RunRepository} held entirely in memory. Tests pass a
 * fresh `runsByOwner` map for isolation; the default shared map serves the
 * local-dev fallback.
 */
export function createInMemoryRunRepository(
  ownerId: string,
  runsByOwner: Map<string, OwnerRuns> = sharedRunsByOwner,
): RunRepository {
  function ownerRuns(): OwnerRuns {
    const existing = runsByOwner.get(ownerId);

    if (existing) {
      return existing;
    }

    const created: OwnerRuns = new Map();
    runsByOwner.set(ownerId, created);

    return created;
  }

  function sortedRuns(): GenerationRun[] {
    return [...ownerRuns().values()].sort(compareNewestSavedRunFirst);
  }

  return {
    async list() {
      return sortedRuns();
    },

    async listPaginated({ cursor, limit }) {
      const runs = sortedRuns();
      const offset = parsePageOffset(cursor);

      return {
        nextCursor: nextPageCursor(offset, limit, runs.length),
        runs: runs.slice(offset, offset + limit),
      };
    },

    async loadById(runId) {
      return ownerRuns().get(runId) ?? null;
    },

    async save(run) {
      ownerRuns().set(run.id, normalizeRunForPersistence(run));
    },

    async delete(runId) {
      ownerRuns().delete(runId);
    },

    async markSeen(runId) {
      const run = ownerRuns().get(runId);

      if (!run) {
        return;
      }

      ownerRuns().set(runId, { ...run, seenAt: new Date().toISOString() });
    },
  };
}
