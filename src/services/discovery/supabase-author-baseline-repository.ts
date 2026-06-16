import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { type AuthorBaseline, authorBaselineSchema } from "./author-baseline";
import type { AuthorBaselineRepository } from "./author-baseline-repository";

const baselinesTable = "author_baselines";

/**
 * The Supabase Postgres implementation of {@link AuthorBaselineRepository}. It is
 * built with the service-role client and always filters on `owner_id`, so the
 * Operator Account boundary is enforced in this layer regardless of row-level
 * security. The full baseline lives in the `payload` JSONB column (validated by
 * {@link authorBaselineSchema} on read); the scalar columns mirror it for
 * inspection and staleness queries.
 */
export function createSupabaseAuthorBaselineRepository(
  ownerId: string,
  client: SupabaseClient,
): AuthorBaselineRepository {
  return {
    async get(authorUsername) {
      const { data, error } = await client
        .from(baselinesTable)
        .select("payload")
        .eq("owner_id", ownerId)
        .eq("author_username", authorUsername)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ? authorBaselineSchema.parse(data.payload) : null;
    },

    async save(baseline: AuthorBaseline) {
      const { error } = await client.from(baselinesTable).upsert(
        {
          owner_id: ownerId,
          author_username: baseline.authorUsername,
          baseline_velocity: baseline.baselineVelocity,
          sample_size: baseline.sampleSize,
          computed_at: baseline.computedAt,
          payload: baseline,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,author_username" },
      );

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
