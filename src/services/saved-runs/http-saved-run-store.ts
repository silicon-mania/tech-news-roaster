import { parseSavedGenerationRun } from "@/services/generation";
import type { GenerationRun, SavedRunStore } from "./types";

const runsEndpoint = "/api/runs";

/**
 * The client-facing Saved Run store. It reaches Supabase only through the server
 * routes, so service keys never enter the browser bundle (ADR-0019). Every
 * method maps onto one route under `/api/runs`.
 */
export const httpSavedRunStore: SavedRunStore = {
  async list() {
    const response = await fetch(runsEndpoint, { headers: { Accept: "application/json" } });

    if (!response.ok) {
      throw new Error("Failed to load saved runs.");
    }

    const body = (await response.json()) as { runs?: unknown };

    return parseRuns(body.runs);
  },

  async listPaginated({ cursor, limit }) {
    const searchParams = new URLSearchParams({ limit: String(limit) });

    if (cursor) {
      searchParams.set("cursor", cursor);
    }

    const response = await fetch(`${runsEndpoint}?${searchParams.toString()}`, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      throw new Error("Failed to load saved runs.");
    }

    const body = (await response.json()) as { nextCursor?: unknown; runs?: unknown };

    return {
      nextCursor: typeof body.nextCursor === "string" ? body.nextCursor : null,
      runs: parseRuns(body.runs),
    };
  },

  async loadById(runId) {
    const response = await fetch(`${runsEndpoint}/${encodeURIComponent(runId)}`, {
      headers: { Accept: "application/json" },
    });

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error("Failed to load the saved run.");
    }

    const body = (await response.json()) as { run?: unknown };

    return parseSavedGenerationRun(body.run);
  },

  async save(run) {
    const response = await fetch(runsEndpoint, {
      body: JSON.stringify(run),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to save the run.");
    }
  },

  async delete(runId) {
    const response = await fetch(`${runsEndpoint}/${encodeURIComponent(runId)}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Failed to delete the saved run.");
    }
  },

  async markSeen(runId) {
    const response = await fetch(`${runsEndpoint}/${encodeURIComponent(runId)}/seen`, {
      method: "POST",
    });

    if (!response.ok) {
      throw new Error("Failed to mark the run seen.");
    }
  },
};

function parseRuns(value: unknown): GenerationRun[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map(parseSavedGenerationRun);
}
