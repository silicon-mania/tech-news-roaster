import type { GenerationRun, SavedRunStore } from "./types";

const databaseName = "tech-news-roaster";
const databaseVersion = 1;
const savedRunsStoreName = "saved-runs";

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
        const savedRuns = request.result
          .filter(isGenerationRun)
          .sort((left, right) => {
            const leftSavedAt = Date.parse(left.savedAt ?? "");
            const rightSavedAt = Date.parse(right.savedAt ?? "");

            return rightSavedAt - leftSavedAt;
          });

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
  if (!run || typeof run !== "object") {
    return false;
  }

  const candidate = run as Partial<GenerationRun>;

  return (
    typeof candidate.id === "string" &&
    typeof candidate.label === "string" &&
    typeof candidate.sourceTweetUrl === "string" &&
    typeof candidate.usersDirection === "string" &&
    (candidate.status === "running" ||
      candidate.status === "completed" ||
      candidate.status === "failed") &&
    typeof candidate.draftCount === "number" &&
    typeof candidate.draftTarget === "number" &&
    Array.isArray(candidate.drafts)
  );
}
