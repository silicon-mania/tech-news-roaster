import type { SeenTweetRepository } from "./seen-tweet-repository";

type OwnerSeenTweets = Set<string>;

// Process-lifetime store shared across requests, backing local fixture development
// (no Supabase configured). Mirrors the in-memory Author Baseline store: the record
// survives reloads for the server's life, while cross-device continuity needs Supabase.
const sharedSeenTweetsByOwner = new Map<string, OwnerSeenTweets>();

/**
 * An owner-scoped {@link SeenTweetRepository} held entirely in memory. Tests pass
 * a fresh `seenTweetsByOwner` map for isolation; the default shared map serves the
 * local-dev fallback.
 */
export function createInMemorySeenTweetRepository(
  ownerId: string,
  seenTweetsByOwner: Map<string, OwnerSeenTweets> = sharedSeenTweetsByOwner,
): SeenTweetRepository {
  function ownerSeenTweets(): OwnerSeenTweets {
    const existing = seenTweetsByOwner.get(ownerId);

    if (existing) {
      return existing;
    }

    const created: OwnerSeenTweets = new Set();
    seenTweetsByOwner.set(ownerId, created);

    return created;
  }

  return {
    async filterUnseen(tweetIds) {
      const seen = ownerSeenTweets();

      return tweetIds.filter((tweetId) => !seen.has(tweetId));
    },

    async markSeen(tweetIds) {
      const seen = ownerSeenTweets();

      for (const tweetId of tweetIds) {
        seen.add(tweetId);
      }
    },
  };
}
