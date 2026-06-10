import { parseSavedGenerationRun } from "@/services/generation/generation-events";
import type { GenerationRun, SavedRunStore } from "./types";

const databaseName = "tech-news-roaster";
const databaseVersion = 1;
const savedRunsStoreName = "saved-runs";
const successfulSavedRunLimit = 10;

export function planSavedRunRetention(runs: GenerationRun[], limit = successfulSavedRunLimit) {
  const successfulRuns = runs
    .filter((run) => run.status === "completed")
    .sort(compareNewestSavedRunFirst);
  const deletedRunIds = new Set(successfulRuns.slice(limit).map((run) => run.id));

  return {
    deletedRunIds,
    retainedRuns: runs.filter((run) => !deletedRunIds.has(run.id)),
  };
}

export const indexedDbSavedRunStore: SavedRunStore = {
  async list() {
    const database = await openSavedRunsDatabase();

    if (!database) {
      return [];
    }

    return new Promise((resolve, reject) => {
      const transaction = database.transaction(savedRunsStoreName, "readonly");
      const store = transaction.objectStore(savedRunsStoreName);
      const request = store.getAll();

      request.onsuccess = () => {
        const savedRuns = request.result.filter(isGenerationRun).sort(compareNewestSavedRunFirst);

        resolve(savedRuns);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async save(run) {
    const database = await openSavedRunsDatabase();

    if (!database) {
      return;
    }

    await writeSavedRun(database, run);
  },

  async delete(runId) {
    const database = await openSavedRunsDatabase();

    if (!database) {
      return;
    }

    await deleteSavedRun(database, runId);
  },
};

async function openSavedRunsDatabase() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return null;
  }

  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, databaseVersion);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(savedRunsStoreName)) {
        database.createObjectStore(savedRunsStoreName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function writeSavedRun(database: IDBDatabase, run: GenerationRun) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(savedRunsStoreName, "readwrite");
    const store = transaction.objectStore(savedRunsStoreName);

    store.put(run);
    if (run.status === "completed") {
      const request = store.getAll();

      request.onsuccess = () => {
        const savedRuns = request.result.filter(isGenerationRun);
        const { deletedRunIds } = planSavedRunRetention(savedRuns);

        for (const runId of deletedRunIds) {
          store.delete(runId);
        }
      };
    }
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function deleteSavedRun(database: IDBDatabase, runId: string) {
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(savedRunsStoreName, "readwrite");
    const store = transaction.objectStore(savedRunsStoreName);

    store.delete(runId);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

function isGenerationRun(run: unknown): run is GenerationRun {
  try {
    parseSavedGenerationRun(run);
    return true;
  } catch {
    return false;
  }
}

function compareNewestSavedRunFirst(left: GenerationRun, right: GenerationRun) {
  const leftSavedAt = getSavedRunTimestamp(left);
  const rightSavedAt = getSavedRunTimestamp(right);

  if (leftSavedAt !== rightSavedAt) {
    return rightSavedAt - leftSavedAt;
  }

  return right.id.localeCompare(left.id);
}

function getSavedRunTimestamp(run: GenerationRun) {
  const savedAt = Date.parse(run.savedAt ?? "");

  return Number.isNaN(savedAt) ? 0 : savedAt;
}
