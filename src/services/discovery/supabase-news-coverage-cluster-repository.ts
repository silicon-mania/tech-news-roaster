import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { type NewsCoverageCluster, parseNewsCoverageCluster } from "./news-coverage-cluster";
import type { NewsCoverageClusterRepository } from "./news-coverage-cluster-repository";

const clustersTable = "news_coverage_clusters";

/**
 * The Supabase Postgres implementation of {@link NewsCoverageClusterRepository}.
 * It is built with the service-role client and always filters on `owner_id`, so
 * the Operator Account boundary is enforced in this layer regardless of row-level
 * security. The full cluster lives in the `payload` JSONB column (validated by
 * {@link parseNewsCoverageCluster} on read); `earliest_created_at` and `run_id`
 * are mirrored as columns for the window scan and the no-second-run check.
 */
export function createSupabaseNewsCoverageClusterRepository(
  ownerId: string,
  client: SupabaseClient,
): NewsCoverageClusterRepository {
  return {
    async listRecent(sinceCreatedAt) {
      const { data, error } = await client
        .from(clustersTable)
        .select("payload")
        .eq("owner_id", ownerId)
        .gte("earliest_created_at", sinceCreatedAt)
        .order("earliest_created_at", { ascending: true });

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []).map((row) => parseNewsCoverageCluster(row.payload));
    },

    async loadById(clusterId) {
      const { data, error } = await client
        .from(clustersTable)
        .select("payload")
        .eq("owner_id", ownerId)
        .eq("id", clusterId)
        .maybeSingle();

      if (error) {
        throw new Error(error.message);
      }

      return data ? parseNewsCoverageCluster(data.payload) : null;
    },

    async save(cluster: NewsCoverageCluster) {
      const { error } = await client.from(clustersTable).upsert(
        {
          owner_id: ownerId,
          id: cluster.id,
          source_tweet_id: cluster.sourceTweetId,
          earliest_created_at: cluster.earliestCreatedAt,
          run_id: cluster.runId,
          payload: cluster,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "owner_id,id" },
      );

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
