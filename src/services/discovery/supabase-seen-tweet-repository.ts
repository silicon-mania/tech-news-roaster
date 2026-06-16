import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SeenTweetRepository } from "./seen-tweet-repository";

const seenTweetsTable = "seen_tweets";

/**
 * The Supabase Postgres implementation of {@link SeenTweetRepository}. It is built
 * with the service-role client and always filters on `owner_id`, so the Operator
 * Account boundary is enforced in this layer regardless of row-level security.
 * The record is one row per (operator, tweet); `filterUnseen` reads back which of
 * the given ids are already stored and returns the complement.
 */
export function createSupabaseSeenTweetRepository(
  ownerId: string,
  client: SupabaseClient,
): SeenTweetRepository {
  return {
    async filterUnseen(tweetIds) {
      if (tweetIds.length === 0) {
        return [];
      }

      const { data, error } = await client
        .from(seenTweetsTable)
        .select("tweet_id")
        .eq("owner_id", ownerId)
        .in("tweet_id", tweetIds);

      if (error) {
        throw new Error(error.message);
      }

      const seen = new Set((data ?? []).map((row) => row.tweet_id as string));

      return tweetIds.filter((tweetId) => !seen.has(tweetId));
    },

    async markSeen(tweetIds) {
      if (tweetIds.length === 0) {
        return;
      }

      const seenAt = new Date().toISOString();
      const rows = tweetIds.map((tweetId) => ({
        owner_id: ownerId,
        tweet_id: tweetId,
        seen_at: seenAt,
      }));
      const { error } = await client
        .from(seenTweetsTable)
        .upsert(rows, { onConflict: "owner_id,tweet_id" });

      if (error) {
        throw new Error(error.message);
      }
    },
  };
}
