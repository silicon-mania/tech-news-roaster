import { type TweetSimilarity, tokenSimilarity } from "./cluster-similarity";
import { type ClusteringConfig, defaultClusteringConfig } from "./clustering-config";
import { type ClusterableTweet, chooseClusterSourceTweet } from "./news-coverage-cluster";

/**
 * A reference to a cluster that already exists in the seen history — enough for a
 * later sweep to test membership without rehydrating the full cluster. `hasRun`
 * is true once the cluster has produced its Automated Run.
 */
export type ExistingClusterRef = {
  id: string;
  sourceText: string;
  earliestCreatedAt: string;
  hasRun: boolean;
};

/** A brand-new News Coverage Cluster formed this sweep — the unit that starts one run. */
export type FormedCluster = {
  sourceTweet: ClusterableTweet;
  memberTweetIds: string[];
  sourceText: string;
  earliestCreatedAt: string;
};

/** A tweet that joined a pre-existing cluster instead of forming a new one. */
type JoinedExistingCluster = {
  clusterId: string;
  tweetId: string;
  /** Whether the joined cluster already produced a run — the no-second-run signal. */
  clusterHasRun: boolean;
};

/**
 * The outcome of clustering a sweep's viral tweets. `newClusters` are the events
 * that should each start exactly one Automated Run; `joinedExisting` are tweets
 * that fell into a cluster from a prior sweep and therefore start no new run —
 * the durable no-second-run guarantee.
 */
export type ClusterPlan = {
  newClusters: FormedCluster[];
  joinedExisting: JoinedExistingCluster[];
};

type ClusterViralTweetsOptions = {
  existingClusters?: ExistingClusterRef[];
  similarity?: TweetSimilarity;
  config?: ClusteringConfig;
};

type WorkingCluster = {
  members: ClusterableTweet[];
};

/**
 * Groups a sweep's qualifying viral tweets into News Coverage Clusters by semantic
 * similarity over the clustering window, so one news event yields at most one run.
 *
 * Tweets are considered earliest-first. Each tweet first tries to join a cluster
 * from a previous sweep (similar enough to that cluster's Source Tweet and within
 * the window of it); joining one never starts a run — that is the cross-sweep
 * no-second-run guarantee, and it holds whether or not the joined cluster has run
 * yet. Otherwise the tweet tries to join a cluster forming this sweep, and failing
 * that seeds a new one. Each new cluster's Source Tweet is the earliest member,
 * ties broken toward media presence then author authority.
 *
 * Pure and data-in/data-out: similarity is injected (defaulting to the coarse
 * token measure) and there is no persistence or clock.
 */
export function clusterViralTweets(
  tweets: ClusterableTweet[],
  {
    existingClusters = [],
    similarity = tokenSimilarity,
    config = defaultClusteringConfig,
  }: ClusterViralTweetsOptions = {},
): ClusterPlan {
  const orderedTweets = [...tweets].sort(
    (left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
  const workingClusters: WorkingCluster[] = [];
  const joinedExisting: JoinedExistingCluster[] = [];

  for (const tweet of orderedTweets) {
    const existing = findExistingCluster(tweet, existingClusters, similarity, config);

    if (existing) {
      joinedExisting.push({
        clusterId: existing.id,
        tweetId: tweet.id,
        clusterHasRun: existing.hasRun,
      });
      continue;
    }

    const working = findWorkingCluster(tweet, workingClusters, similarity, config);

    if (working) {
      working.members.push(tweet);
      continue;
    }

    workingClusters.push({ members: [tweet] });
  }

  return {
    newClusters: workingClusters.map(toFormedCluster),
    joinedExisting,
  };
}

function findExistingCluster(
  tweet: ClusterableTweet,
  existingClusters: ExistingClusterRef[],
  similarity: TweetSimilarity,
  config: ClusteringConfig,
): ExistingClusterRef | null {
  for (const cluster of existingClusters) {
    if (
      withinWindow(cluster.earliestCreatedAt, tweet.createdAt, config) &&
      similarity(cluster.sourceText, tweet.text) >= config.similarityThreshold
    ) {
      return cluster;
    }
  }

  return null;
}

function findWorkingCluster(
  tweet: ClusterableTweet,
  workingClusters: WorkingCluster[],
  similarity: TweetSimilarity,
  config: ClusteringConfig,
): WorkingCluster | null {
  for (const cluster of workingClusters) {
    const source = chooseClusterSourceTweet(cluster.members);

    if (
      withinWindow(source.createdAt, tweet.createdAt, config) &&
      similarity(source.text, tweet.text) >= config.similarityThreshold
    ) {
      return cluster;
    }
  }

  return null;
}

/**
 * Whether `tweetCreatedAt` falls inside the clustering window anchored on
 * `sourceCreatedAt`. The span is measured absolutely so an out-of-order arrival
 * (a tweet posted before the current anchor) is still eligible.
 */
function withinWindow(
  sourceCreatedAt: string,
  tweetCreatedAt: string,
  config: ClusteringConfig,
): boolean {
  return (
    Math.abs(Date.parse(tweetCreatedAt) - Date.parse(sourceCreatedAt)) <= config.clusterWindowMs
  );
}

function toFormedCluster({ members }: WorkingCluster): FormedCluster {
  const sourceTweet = chooseClusterSourceTweet(members);

  return {
    sourceTweet,
    memberTweetIds: members.map((member) => member.id),
    sourceText: sourceTweet.text,
    earliestCreatedAt: sourceTweet.createdAt,
  };
}
