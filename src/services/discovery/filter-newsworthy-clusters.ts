import type { FormedCluster } from "./cluster-viral-tweets";
import {
  createDefaultNewsworthinessJudge,
  type NewsworthinessJudge,
  type NewsworthinessVerdict,
} from "./newsworthiness-filter";
import type { SeenTweetRepository } from "./seen-tweet-repository";

/**
 * The outcome of running the Newsworthiness Filter over a sweep's newly-formed
 * News Coverage Clusters. `accepted` clusters proceed to an Automated Run;
 * `rejected` clusters are dropped permanently — their tweets are recorded in the
 * seen-tweet record before this resolves, so a later overlapping sweep never
 * re-evaluates them and they are never surfaced for manual recovery.
 */
export type NewsworthinessPlan = {
  accepted: FormedCluster[];
  rejected: Array<{ cluster: FormedCluster; reason: string }>;
};

type FilterNewsworthyClustersOptions = {
  seenTweetRepository: SeenTweetRepository;
  judge?: NewsworthinessJudge;
};

/**
 * Applies the permissive Newsworthiness Filter to each new cluster's Source Tweet,
 * partitioning the clusters into the ones worth an Automated Run and the off-topic
 * noise to drop. Rejected clusters' member tweet ids are written to the seen-tweet
 * record via `markSeen`, which is exactly the mechanism that stops a later sweep
 * reprocessing a tweet — so a rejected tweet is dropped permanently, never
 * surfaced, and never re-judged.
 *
 * Permissive by design: the judge's verdict drops a tweet only on a clear `false`,
 * and a judge that throws keeps the tweet (recall over precision — a slow or broken
 * judge never silently drops real news).
 */
export async function filterNewsworthyClusters(
  clusters: FormedCluster[],
  {
    seenTweetRepository,
    judge = createDefaultNewsworthinessJudge(),
  }: FilterNewsworthyClustersOptions,
): Promise<NewsworthinessPlan> {
  const judged = await Promise.all(
    clusters.map(async (cluster) => ({
      cluster,
      verdict: await judgePermissively(judge, cluster),
    })),
  );

  const accepted = judged.filter(({ verdict }) => verdict.newsworthy).map(({ cluster }) => cluster);
  const rejected = judged
    .filter(({ verdict }) => !verdict.newsworthy)
    .map(({ cluster, verdict }) => ({ cluster, reason: verdict.reason }));

  const rejectedTweetIds = rejected.flatMap(({ cluster }) => cluster.memberTweetIds);

  if (rejectedTweetIds.length > 0) {
    await seenTweetRepository.markSeen(rejectedTweetIds);
  }

  return { accepted, rejected };
}

async function judgePermissively(
  judge: NewsworthinessJudge,
  cluster: FormedCluster,
): Promise<NewsworthinessVerdict> {
  try {
    return await judge.judge({
      text: cluster.sourceTweet.text,
      hasMedia: cluster.sourceTweet.hasMedia,
    });
  } catch (error) {
    return {
      newsworthy: true,
      reason: `Newsworthiness judge failed; kept (permissive): ${describeError(error)}`,
    };
  }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
