import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseSavedGenerationRun } from "@/services/generation";
import { nextPageCursor, normalizeRunForPersistence, parsePageOffset } from "./run-persistence";
import type { GenerationRun, RunRepository } from "./types";

const runsTable = "generation_runs";

/**
 * The Supabase Postgres implementation of {@link RunRepository}. It is built
 * with the service-role client and always filters on `owner_id`, so the
 * Operator Account boundary is enforced in this layer regardless of row-level
 * security. The full run lives in the `payload` JSONB column; `origin`,
 * `saved_at`, and `seen_at` are mirrored as columns for ordering and the future
 * unseen-runs filter.
 */
export function createSupabaseRunRepository(
  ownerId: string,
  client: SupabaseClient,
): RunRepository {
  async function loadById(runId: string): Promise<GenerationRun | null> {
    const { data, error } = await client
      .from(runsTable)
      .select("payload")
      .eq("owner_id", ownerId)
      .eq("id", runId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message);
    }

    return data ? parseSavedGenerationRun(data.payload) : null;
  }

  async function save(run: GenerationRun): Promise<void> {
    const normalized = normalizeRunForPersistence(run);
    const { error } = await client.from(runsTable).upsert(
      {
        id: normalized.id,
        origin: normalized.origin ?? "manual",
        owner_id: ownerId,
        payload: normalized,
        saved_at: normalized.savedAt ?? null,
        seen_at: normalized.seenAt ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "owner_id,id" },
    );

    if (error) {
      throw new Error(error.message);
    }
  }

  return {
    async list() {
      const { data, error } = await client
        .from(runsTable)
        .select("payload")
        .eq("owner_id", ownerId)
        .order("saved_at", { ascending: false, nullsFirst: false });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((row) => parseSavedGenerationRun(row.payload));
    },

    async listPaginated({ cursor, limit }) {
      const offset = parsePageOffset(cursor);
      const { count, data, error } = await client
        .from(runsTable)
        .select("payload", { count: "exact" })
        .eq("owner_id", ownerId)
        .order("saved_at", { ascending: false, nullsFirst: false })
        .range(offset, offset + limit - 1);

      if (error) {
        throw new Error(error.message);
      }

      const runs = (data ?? []).map((row) => parseSavedGenerationRun(row.payload));

      return {
        nextCursor: nextPageCursor(offset, limit, count ?? offset + runs.length),
        runs,
      };
    },

    loadById,

    save,

    async delete(runId) {
      const { error } = await client
        .from(runsTable)
        .delete()
        .eq("owner_id", ownerId)
        .eq("id", runId);

      if (error) {
        throw new Error(error.message);
      }
    },

    async markSeen(runId) {
      const run = await loadById(runId);

      if (!run) {
        return;
      }

      await save({ ...run, seenAt: new Date().toISOString() });
    },
  };
}
