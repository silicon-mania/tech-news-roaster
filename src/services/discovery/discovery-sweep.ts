import "server-only";

import { readPrimaryOperatorEmail } from "@/services/auth";
import { composeAutomatedRun } from "@/services/automated-run/compose-automated-run";
import { isDiscoverySweepReady, readRuntimeStatus } from "@/services/runtime-status";
import { fanOutAutomatedRun } from "@/services/saved-runs/fan-out-automated-run";
import {
  type FanOutTargetsResolution,
  resolveFanOutTargets,
} from "@/services/saved-runs/resolve-fan-out-targets";
import { resolveHeadlessOperatorSession } from "@/services/saved-runs/resolve-headless-operator";
import { resolveOwnerId } from "@/services/saved-runs/run-repository";
import {
  type DiscoveredTweet,
  type ListTimelineWindow,
  readListTimeline,
} from "@/services/tweet-retrieval";
import type { AuthorBaselineRepository } from "./author-baseline-repository";
import { createAuthorBaselineRepository } from "./author-baseline-store";
import { type AuthorTweetSampler, fixtureAuthorTweetSampler } from "./author-tweet-sampler";
import { type TweetSimilarity, tokenSimilarity } from "./cluster-similarity";
import {
  clusterViralTweets,
  type ExistingClusterRef,
  type FormedCluster,
} from "./cluster-viral-tweets";
import { type ClusteringConfig, defaultClusteringConfig } from "./clustering-config";
import { type DiscoverySweepConfig, defaultDiscoverySweepConfig } from "./discovery-sweep-config";
import { filterNewsworthyClusters } from "./filter-newsworthy-clusters";
import {
  type NewsCoverageCluster,
  parseNewsCoverageCluster,
  toClusterableTweet,
} from "./news-coverage-cluster";
import type { NewsCoverageClusterRepository } from "./news-coverage-cluster-repository";
import { createNewsCoverageClusterRepository } from "./news-coverage-cluster-store";
import type { NewsworthinessJudge } from "./newsworthiness-filter";
import { qualifyTweetVirality } from "./resolve-author-baseline";
import type { SeenTweetRepository } from "./seen-tweet-repository";
import { createSeenTweetRepository } from "./seen-tweet-store";
import { defaultViralityConfig, type ViralityConfig } from "./virality-config";

type SweepEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * The Discovery Source and trailing window a single sweep reads. Consecutive sweeps
 * overlap their windows (the seen-tweet record + cluster dedup make that safe); the
 * scheduling that produces overlapping windows, and the interval Y, are deferred to
 * issue 021 — the sweep takes the window as input rather than deriving a schedule.
 */
export type DiscoverySweepInput = {
  /** Operator-owned X List ids covering the Discovery Source (~5 lists for ~5000 follows). */
  listIds: string[];
  /** Trailing time window to read; may abut or overlap the previous sweep's. */
  window: ListTimelineWindow;
};

/** One Automated Run a sweep started, with the cluster it came from and its rank score. */
type StartedRun = {
  runId: string;
  clusterId: string;
  sourceTweetId: string;
  sourceTweetUrl: string;
  authorRelativeScore: number;
};

/** A newsworthy cluster the per-sweep cap dropped — logged, never silently discarded. */
type CapDroppedCluster = {
  sourceTweetId: string;
  sourceText: string;
  authorRelativeScore: number;
};

/**
 * A structured log entry the sweep emits:
 * - `cap-drop` — a newsworthy cluster the per-sweep cap dropped;
 * - `primary-operator` — the operator it anchored under this sweep, logged so config
 *   drift in the load-bearing first allowlist entry is visible;
 * - `fan-out-skip-unprovisioned` — an allowlisted operator with no account yet, skipped
 *   from fan-out (forward-only, no backfill);
 * - `fan-out-copy-failed` — a best-effort per-operator copy that failed, so that operator
 *   misses just that one run while the anchor's run and the other copies persist.
 */
export type DiscoverySweepLogEntry =
  | (CapDroppedCluster & { event: "cap-drop"; cap: number })
  | { event: "primary-operator"; email: string }
  | { event: "fan-out-skip-unprovisioned"; email: string }
  | { event: "fan-out-copy-failed"; email: string; runId: string; error: string };

type DiscoverySweepLogger = (entry: DiscoverySweepLogEntry) => void;

/**
 * The owner-scoped stores a sweep persists through (one Operator Account). The Saved
 * Run repository is resolved by {@link composeAutomatedRun} itself, so it is not held
 * here.
 */
type DiscoverySweepRepositories = {
  seenTweet: SeenTweetRepository;
  authorBaseline: AuthorBaselineRepository;
  newsCoverageCluster: NewsCoverageClusterRepository;
};

type DiscoverySweepRepositoriesResolution =
  | { repositories: DiscoverySweepRepositories; ownerId: string }
  | { unauthorized: true };

export type DiscoverySweepDependencies = {
  /** The Runtime Readiness Gate. Defaults to reading runtime status and applying
   *  {@link isDiscoverySweepReady}; a `false` result starts nothing this cycle. */
  isReady?: () => Promise<boolean>;
  readListTimeline?: typeof readListTimeline;
  /** Resolves the Primary Operator's owner-scoped discovery stores and anchor owner id. */
  resolveRepositories?: () => Promise<DiscoverySweepRepositoriesResolution>;
  /** Resolves the signed-in operators each finished run is copied to. Defaults to the
   *  allowlist → account resolver. */
  resolveFanOutTargets?: () => Promise<FanOutTargetsResolution>;
  /** Copies a finished Automated Run into the non-anchor operators. */
  fanOutRun?: typeof fanOutAutomatedRun;
  sampler?: AuthorTweetSampler;
  composeRun?: typeof composeAutomatedRun;
  newsworthinessJudge?: NewsworthinessJudge;
  similarity?: TweetSimilarity;
  logger?: DiscoverySweepLogger;
  now?: () => Date;
  createClusterId?: () => string;
  viralityConfig?: ViralityConfig;
  clusteringConfig?: ClusteringConfig;
  config?: DiscoverySweepConfig;
  env?: SweepEnvironment;
};

/** How many of this sweep's Automated Runs were copied to one signed-in operator. The
 *  anchor is excluded — it holds each composed original, not a copy. */
type FanOutOperatorCount = {
  email: string;
  userId: string;
  copied: number;
  failed: number;
};

/** The fan-out outcome of a sweep: per-operator copy counts, plus the allowlisted
 *  operators skipped for not having an account yet. */
type FanOutSummary = {
  perOperator: FanOutOperatorCount[];
  skippedUnprovisioned: string[];
};

export type DiscoverySweepResult =
  | { status: "not-ready" }
  | { status: "unauthorized" }
  | {
      status: "completed";
      /** Runs started this sweep, highest virality first. */
      startedRuns: StartedRun[];
      /** Newsworthy clusters the per-sweep cap dropped (also logged). */
      droppedByCap: CapDroppedCluster[];
      /** Tweets that joined a prior cluster and so started no run (no-second-run). */
      joinedExistingClusters: number;
      /** Per-operator fan-out copy counts and skipped (un-provisioned) operators. */
      fanOut: FanOutSummary;
    };

/**
 * The single scheduled entry point of the Discovery Service. It composes, in fixed
 * order: read the trailing window from the Discovery Source List timelines (014) →
 * drop tweets already in the seen-tweet record → score author-relative virality (015)
 * and keep qualifiers → form News Coverage Clusters (016) → apply the Newsworthiness
 * Filter to each new cluster's Source Tweet (017) → start one Automated Run per
 * surviving cluster via the composition pipeline (019), capped per sweep and ranked
 * by virality, with anything the cap drops logged rather than silently discarded.
 *
 * A sweep that finds the Runtime Readiness Gate not ready, or that cannot resolve an
 * Operator Account, starts nothing that cycle. Consecutive overlapping sweeps never
 * duplicate a run: a tweet already seen is filtered out, and a new tweet that joins a
 * cluster from a prior sweep starts no run (seen-tweet record + cluster dedup).
 *
 * The cap is a documented default ({@link defaultDiscoverySweepConfig}); the sweep
 * hard-codes no schedule or interval — those are 021's concern.
 */
export async function runDiscoverySweep(
  input: DiscoverySweepInput,
  dependencies: DiscoverySweepDependencies = {},
): Promise<DiscoverySweepResult> {
  const env = dependencies.env ?? process.env;
  const isReady = dependencies.isReady ?? (() => defaultIsReady(env));
  const read = dependencies.readListTimeline ?? readListTimeline;
  const resolveRepositories =
    dependencies.resolveRepositories ?? (() => resolveDiscoverySweepRepositories(env));
  const resolveFanOut = dependencies.resolveFanOutTargets ?? (() => resolveFanOutTargets(env));
  const fanOut = dependencies.fanOutRun ?? fanOutAutomatedRun;
  const sampler = dependencies.sampler ?? fixtureAuthorTweetSampler;
  const compose = dependencies.composeRun ?? composeAutomatedRun;
  const similarity = dependencies.similarity ?? tokenSimilarity;
  const logger = dependencies.logger ?? defaultLogger;
  const now = dependencies.now ?? (() => new Date());
  const createClusterId = dependencies.createClusterId ?? defaultCreateClusterId;
  const viralityConfig = dependencies.viralityConfig ?? defaultViralityConfig;
  const clusteringConfig = dependencies.clusteringConfig ?? defaultClusteringConfig;
  const config = dependencies.config ?? defaultDiscoverySweepConfig;

  // The Runtime Readiness Gate. A not-ready sweep starts nothing this cycle.
  if (!(await isReady())) {
    return { status: "not-ready" };
  }

  // Log the Primary Operator this sweep anchors under (the first allowlist entry) so
  // config drift — a reordered or removed first entry re-anchoring discovery under
  // empty seen-tweet/cluster/baseline state — is visible in cron logs (ADR-0024).
  const primaryOperatorEmail = readPrimaryOperatorEmail(env);

  if (primaryOperatorEmail) {
    logger({ event: "primary-operator", email: primaryOperatorEmail });
  }

  // Resolve the Operator Account's owner-scoped stores. A sweep that cannot resolve
  // an owner starts nothing — it would otherwise persist unowned runs and dedup
  // records.
  const resolution = await resolveRepositories();

  if ("unauthorized" in resolution) {
    return { status: "unauthorized" };
  }

  const { seenTweet, authorBaseline, newsCoverageCluster } = resolution.repositories;
  const anchorOwnerId = resolution.ownerId;

  // Resolve the fan-out targets once — they do not change within a sweep. Each finished
  // Automated Run, composed once under the anchor, is copied to every *other* signed-in
  // operator (ADR-0024). Allowlisted operators with no account yet are skipped and
  // logged — forward-only, no backfill. Per-operator copy counts (anchor excluded, since
  // it holds each original) accumulate across the runs this sweep starts.
  const fanOutTargets = await resolveFanOut();
  const copyCountByOwnerId = new Map<string, FanOutOperatorCount>();

  for (const target of fanOutTargets.targets) {
    if (target.userId === anchorOwnerId) {
      continue;
    }

    copyCountByOwnerId.set(target.userId, {
      email: target.email,
      userId: target.userId,
      copied: 0,
      failed: 0,
    });
  }

  for (const email of fanOutTargets.skipped) {
    logger({ event: "fan-out-skip-unprovisioned", email });
  }

  const nowMs = now().getTime();

  // 1. Read the trailing window from the Discovery Source List timelines.
  const listRead = await read({
    listIds: input.listIds,
    window: input.window,
    minFaves: config.minFaves,
    minReposts: config.minReposts,
  });

  // 2. Drop tweets already in the seen-tweet record — overlapping windows lose
  //    nothing at the edges yet never process the same tweet twice.
  const unseenIds = new Set(await seenTweet.filterUnseen(listRead.tweets.map((tweet) => tweet.id)));
  const unseenTweets = listRead.tweets.filter((tweet) => unseenIds.has(tweet.id));

  // 3. Score author-relative virality and keep the qualifiers. A non-qualifying tweet
  //    is deliberately *not* recorded seen, so a later overlapping sweep re-scores it
  //    as its velocity builds (recall over precision); it ages out of the window on
  //    its own.
  const discoveredByTweetId = new Map<string, DiscoveredTweet>();
  const scoreByTweetId = new Map<string, number>();
  const clusterableTweets = [];

  for (const tweet of unseenTweets) {
    const qualification = await qualifyTweetVirality({
      tweet,
      repository: authorBaseline,
      sampler,
      nowMs,
      config: viralityConfig,
    });

    if (!qualification.qualifies) {
      continue;
    }

    discoveredByTweetId.set(tweet.id, tweet);
    scoreByTweetId.set(tweet.id, qualification.authorRelativeScore);
    clusterableTweets.push(
      toClusterableTweet(tweet, { authorAuthority: qualification.baseline.baselineVelocity }),
    );
  }

  // 4. Form News Coverage Clusters over the rolling window, against the clusters a
  //    prior sweep already formed.
  const windowStart = new Date(nowMs - clusteringConfig.clusterWindowMs).toISOString();
  const existingClusters = await newsCoverageCluster.listRecent(windowStart);
  const plan = clusterViralTweets(clusterableTweets, {
    existingClusters: existingClusters.map(toExistingClusterRef),
    similarity,
    config: clusteringConfig,
  });

  // A tweet that joined a prior cluster never starts a run — record it seen so a
  // later overlapping sweep does not reconsider it (the durable no-second-run
  // guarantee, alongside cluster dedup).
  const joinedTweetIds = plan.joinedExisting.map((joined) => joined.tweetId);

  if (joinedTweetIds.length > 0) {
    await seenTweet.markSeen(joinedTweetIds);
  }

  // 5. Newsworthiness Filter on each new cluster's Source Tweet. Rejected clusters
  //    are dropped permanently — their tweets are recorded seen inside the filter.
  const newsworthiness = await filterNewsworthyClusters(plan.newClusters, {
    seenTweetRepository: seenTweet,
    ...(dependencies.newsworthinessJudge ? { judge: dependencies.newsworthinessJudge } : {}),
  });

  // 6. Per-sweep cap: rank the survivors by virality, keep the top N, log the rest.
  //    Dropped clusters are not recorded seen, so a later sweep reconsiders them while
  //    they remain in the trailing window (deferred, not silently discarded).
  const ranked = [...newsworthiness.accepted].sort((left, right) =>
    compareByVirality(left, right, scoreByTweetId),
  );
  const kept = ranked.slice(0, config.maxRunsPerSweep);
  const dropped = ranked.slice(config.maxRunsPerSweep);
  const droppedByCap = dropped.map((cluster) => toCapDroppedCluster(cluster, scoreByTweetId));

  for (const entry of droppedByCap) {
    logger({ event: "cap-drop", cap: config.maxRunsPerSweep, ...entry });
  }

  // 7. Start one Automated Run per kept cluster, highest virality first. Each started
  //    run links to its cluster; the cluster is persisted with the run id and its
  //    member tweets recorded seen, so a later overlapping sweep starts no second run.
  const startedRuns: StartedRun[] = [];

  for (const cluster of kept) {
    const discovered = discoveredByTweetId.get(cluster.sourceTweet.id);

    if (!discovered) {
      // Unreachable: every clusterable tweet came from a discovered one.
      continue;
    }

    const clusterId = createClusterId();
    const composed = await compose(
      {
        sourceTweetUrl: discovered.url,
        newsCoverageClusterId: clusterId,
      },
      // The sweep is unattended (no operator session): compose must resolve the
      // Operator Account headlessly, the same way as the discovery stores below.
      { operatorSession: resolveHeadlessOperatorSession, env },
    );

    if ("unauthorized" in composed) {
      // The gate cleared but the operator became unresolvable mid-sweep; stop rather
      // than persist a half-linked cluster.
      return { status: "unauthorized" };
    }

    const linkedAt = now().toISOString();

    await newsCoverageCluster.save(
      parseNewsCoverageCluster({
        id: clusterId,
        sourceTweetId: cluster.sourceTweet.id,
        sourceText: cluster.sourceText,
        memberTweetIds: cluster.memberTweetIds,
        earliestCreatedAt: cluster.earliestCreatedAt,
        runId: composed.run.id,
        createdAt: linkedAt,
        updatedAt: linkedAt,
      }),
    );
    await seenTweet.markSeen(cluster.memberTweetIds);

    startedRuns.push({
      runId: composed.run.id,
      clusterId,
      sourceTweetId: cluster.sourceTweet.id,
      sourceTweetUrl: discovered.url,
      authorRelativeScore: scoreByTweetId.get(cluster.sourceTweet.id) ?? 0,
    });

    // Fan the finished run out to the other signed-in operators (best-effort per
    // operator). The anchor already holds this original — fanOut filters it out. A
    // failed copy is logged and isolated: that operator misses just this one run.
    const copyOutcomes = await fanOut(
      { run: composed.run, anchorOwnerId, targets: fanOutTargets.targets },
      { env },
    );

    for (const outcome of copyOutcomes) {
      const counts = copyCountByOwnerId.get(outcome.userId);

      if (!counts) {
        continue; // defensive: fanOut already excludes the anchor.
      }

      if (outcome.status === "copied") {
        counts.copied += 1;
      } else {
        counts.failed += 1;
        logger({
          event: "fan-out-copy-failed",
          email: outcome.email,
          runId: composed.run.id,
          error: outcome.error,
        });
      }
    }
  }

  return {
    status: "completed",
    startedRuns,
    droppedByCap,
    joinedExistingClusters: plan.joinedExisting.length,
    fanOut: {
      perOperator: [...copyCountByOwnerId.values()],
      skippedUnprovisioned: fanOutTargets.skipped,
    },
  };
}

async function defaultIsReady(env: SweepEnvironment): Promise<boolean> {
  return isDiscoverySweepReady(await readRuntimeStatus({ env }));
}

/**
 * The default owner resolution: the same {@link resolveOwnerId} the Saved Run,
 * Author Baseline, and seen-tweet stores use, so a sweep's runs, baselines, clusters,
 * and dedup record all land under one Operator Account.
 */
async function resolveDiscoverySweepRepositories(
  env: SweepEnvironment,
): Promise<DiscoverySweepRepositoriesResolution> {
  // Unattended: resolve the one operator by allowlisted email (service-role admin),
  // not a session cookie — a cron sweep has none. See resolveHeadlessOperatorSession.
  const owner = await resolveOwnerId(env, resolveHeadlessOperatorSession);

  if ("unauthorized" in owner) {
    return { unauthorized: true };
  }

  return {
    ownerId: owner.ownerId,
    repositories: {
      seenTweet: createSeenTweetRepository(owner.ownerId, env),
      authorBaseline: createAuthorBaselineRepository(owner.ownerId, env),
      newsCoverageCluster: createNewsCoverageClusterRepository(owner.ownerId, env),
    },
  };
}

function toExistingClusterRef(cluster: NewsCoverageCluster): ExistingClusterRef {
  return {
    id: cluster.id,
    sourceText: cluster.sourceText,
    earliestCreatedAt: cluster.earliestCreatedAt,
    hasRun: cluster.runId !== null,
  };
}

function toCapDroppedCluster(
  cluster: FormedCluster,
  scoreByTweetId: Map<string, number>,
): CapDroppedCluster {
  return {
    sourceTweetId: cluster.sourceTweet.id,
    sourceText: cluster.sourceText,
    authorRelativeScore: scoreByTweetId.get(cluster.sourceTweet.id) ?? 0,
  };
}

/** Highest virality first; ties broken by Source Tweet id so ranking is deterministic. */
function compareByVirality(
  left: FormedCluster,
  right: FormedCluster,
  scoreByTweetId: Map<string, number>,
): number {
  const leftScore = scoreByTweetId.get(left.sourceTweet.id) ?? 0;
  const rightScore = scoreByTweetId.get(right.sourceTweet.id) ?? 0;

  if (rightScore !== leftScore) {
    return rightScore - leftScore;
  }

  return left.sourceTweet.id.localeCompare(right.sourceTweet.id);
}

const defaultLogger: DiscoverySweepLogger = (entry) => {
  if (entry.event === "primary-operator") {
    console.info(`[discovery-sweep] primary-operator: anchoring under ${entry.email}.`);

    return;
  }

  if (entry.event === "fan-out-skip-unprovisioned") {
    console.info(
      `[discovery-sweep] fan-out-skip: ${entry.email} has no Operator Account yet — skipped (no backfill).`,
    );

    return;
  }

  if (entry.event === "fan-out-copy-failed") {
    console.warn(
      `[discovery-sweep] fan-out-copy-failed: run ${entry.runId} could not be copied to ${entry.email} (${entry.error}); that operator misses this run.`,
    );

    return;
  }

  console.warn(
    `[discovery-sweep] cap-drop: tweet ${entry.sourceTweetId} (score ${entry.authorRelativeScore.toFixed(
      2,
    )}) dropped by per-sweep cap of ${entry.cap}.`,
  );
};

function defaultCreateClusterId(): string {
  return `news-coverage-cluster-${crypto.randomUUID()}`;
}
