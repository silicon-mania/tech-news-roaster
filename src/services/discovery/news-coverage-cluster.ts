import { z } from "zod";
import type { RetrievedSourceTweet } from "@/services/tweet-retrieval";

/**
 * The minimum a viral tweet must carry to be clustered. `text` feeds the semantic
 * similarity measure; `createdAt`, `hasMedia`, and `authorAuthority` decide which
 * member becomes the cluster's Source Tweet (see {@link chooseClusterSourceTweet}).
 */
export type ClusterableTweet = {
  id: string;
  text: string;
  /** ISO-8601 post time. The earliest member is preferred as the Source Tweet. */
  createdAt: string;
  /** Whether the tweet carries its own media — the first tie-break after recency. */
  hasMedia: boolean;
  /**
   * A relative measure of the author's standing (e.g. their Author Baseline
   * velocity) — the second tie-break, higher wins. The clustering logic never
   * computes it; the Discovery Sweep supplies it.
   */
  authorAuthority: number;
};

/**
 * A persisted News Coverage Cluster: the single news event several viral tweets
 * witness. `sourceTweetId`/`sourceText` are the earliest qualifying member chosen
 * by {@link chooseClusterSourceTweet}; `runId` records the one Automated Run the
 * cluster produced (null until then), and is what makes the no-second-run
 * guarantee durable across overlapping sweeps.
 */
const newsCoverageClusterSchema = z
  .object({
    id: z.string().min(1),
    sourceTweetId: z.string().min(1),
    sourceText: z.string().min(1),
    memberTweetIds: z.array(z.string().min(1)).min(1),
    /** The Source Tweet's post time — the clustering window's anchor. */
    earliestCreatedAt: z.string().datetime(),
    runId: z.string().min(1).nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict();

export type NewsCoverageCluster = z.infer<typeof newsCoverageClusterSchema>;

export function parseNewsCoverageCluster(cluster: unknown): NewsCoverageCluster {
  return newsCoverageClusterSchema.parse(cluster);
}

/**
 * Chooses a cluster's Source Tweet from its members: the earliest tweet that
 * crossed virality, with ties broken toward media presence, then author
 * authority, then a stable id fallback so the choice is always deterministic.
 */
export function chooseClusterSourceTweet(members: ClusterableTweet[]): ClusterableTweet {
  const [first, ...rest] = members;

  if (!first) {
    throw new Error("A News Coverage Cluster needs at least one member.");
  }

  return rest.reduce(
    (best, candidate) => (compareSourceTweetPreference(candidate, best) < 0 ? candidate : best),
    first,
  );
}

/**
 * Orders two candidate Source Tweets, most-preferred first (negative = `left`
 * wins). Earliest post time wins; on a tie, the tweet with media; then the higher
 * author authority; then the lexicographically smaller id as a deterministic
 * backstop.
 */
function compareSourceTweetPreference(left: ClusterableTweet, right: ClusterableTweet): number {
  const byRecency = Date.parse(left.createdAt) - Date.parse(right.createdAt);

  if (byRecency !== 0) {
    return byRecency;
  }

  const byMedia = Number(right.hasMedia) - Number(left.hasMedia);

  if (byMedia !== 0) {
    return byMedia;
  }

  const byAuthority = right.authorAuthority - left.authorAuthority;

  if (byAuthority !== 0) {
    return byAuthority;
  }

  return left.id.localeCompare(right.id);
}

/**
 * Adapts a retrieved tweet into a {@link ClusterableTweet}. Media presence comes
 * from the tweet's own media references; author authority is supplied by the
 * Discovery Sweep (typically the author's baseline velocity).
 */
export function toClusterableTweet(
  tweet: RetrievedSourceTweet,
  { authorAuthority }: { authorAuthority: number },
): ClusterableTweet {
  return {
    id: tweet.id,
    text: tweet.text,
    createdAt: tweet.createdAt,
    hasMedia: tweet.mediaReferences.length > 0,
    authorAuthority,
  };
}
