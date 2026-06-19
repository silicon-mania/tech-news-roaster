import { describe, expect, test } from "vitest";
import type {
  ComposeAutomatedRunInput,
  composeAutomatedRun,
} from "@/services/automated-run/compose-automated-run";
import type { SavedGenerationRun } from "@/services/generation";
import type { DiscoveredTweet } from "@/services/tweet-retrieval";
import { authorBaselineSchema } from "./author-baseline";
import type { AuthorBaselineRepository } from "./author-baseline-repository";
import {
  type DiscoverySweepDependencies,
  type DiscoverySweepLogEntry,
  runDiscoverySweep,
} from "./discovery-sweep";
import { createInMemoryAuthorBaselineRepository } from "./in-memory-author-baseline-repository";
import { createInMemoryNewsCoverageClusterRepository } from "./in-memory-news-coverage-cluster-repository";
import { createInMemorySeenTweetRepository } from "./in-memory-seen-tweet-repository";
import { createLocalNewsworthinessJudge } from "./newsworthiness-filter";

const owner = "operator-account";
const fixedNowIso = "2026-06-16T12:00:00.000Z";
const oneHourAgoIso = "2026-06-16T11:00:00.000Z";
const halfHourAgoIso = "2026-06-16T11:30:00.000Z";
const windowSinceIso = "2026-06-16T06:00:00.000Z";

// Distinct-vocabulary tech-news texts: each carries a tech signal (so the permissive
// Newsworthiness Filter keeps it) and shares no content tokens with the others (so each
// forms its own News Coverage Cluster under the real token-similarity measure).
const ACME_NEWS = "Acme launches its new AI inference chip with record benchmark numbers";
const ACME_NEWS_FOLLOWUP =
  "Acme AI inference chip launches with record benchmark numbers confirmed";
const BRAVO_NEWS = "Bravoware raises a huge Series B funding round led by top investors";
const DELPHIC_NEWS = "Delphic releases an open source database framework for developers";
// Clear off-topic noise with no tech signal — the Newsworthiness Filter drops it.
const NOISE_TEXT = "lol happy birthday memes good vibes brunch hangover wordle";
// Tech news that never qualifies virality: its author's baseline is set high enough.
const ECHO_NEWS = "Echo Corp ships a minor app update today";

function buildTweet(overrides: {
  id: string;
  username: string;
  text: string;
  reposts: number;
  likes: number;
  hasMedia?: boolean;
  createdAt?: string;
}): DiscoveredTweet {
  return {
    id: overrides.id,
    url: `https://x.com/${overrides.username}/status/${overrides.id}`,
    text: overrides.text,
    createdAt: overrides.createdAt ?? oneHourAgoIso,
    author: { username: overrides.username, displayName: overrides.username },
    metrics: {
      replies: 0,
      reposts: overrides.reposts,
      quotes: 0,
      likes: overrides.likes,
      views: 0,
    },
    mediaReferences: overrides.hasMedia
      ? [{ id: `${overrides.id}-media`, kind: "image", url: "https://cdn.example.com/x.jpg" }]
      : [],
  };
}

// Tweets with createdAt one hour ago score velocity = weighted engagement (age floored
// at 1h). With each author's baseline pre-seeded at 0.5 the author-relative score is
// 2 × engagement, so all of these clear the bar with distinct, ordered scores.
const acmeTweet = buildTweet({
  id: "tweet-acme",
  username: "acme",
  text: ACME_NEWS,
  reposts: 200,
  likes: 100,
  hasMedia: true,
}); // engagement 700 → score 1400
const bravoTweet = buildTweet({
  id: "tweet-bravo",
  username: "bravo",
  text: BRAVO_NEWS,
  reposts: 80,
  likes: 40,
}); // engagement 280 → score 560
const delphicTweet = buildTweet({
  id: "tweet-delphic",
  username: "delphic",
  text: DELPHIC_NEWS,
  reposts: 30,
  likes: 20,
}); // engagement 110 → score 220
const noiseTweet = buildTweet({
  id: "tweet-noise",
  username: "noise",
  text: NOISE_TEXT,
  reposts: 150,
  likes: 80,
}); // qualifies virality, rejected by newsworthiness
const echoTweet = buildTweet({
  id: "tweet-echo",
  username: "echo",
  text: ECHO_NEWS,
  reposts: 100,
  likes: 50,
}); // engagement 350, but echo's high baseline keeps its score below the bar

function fakeRun(id: string): SavedGenerationRun {
  return { id } as unknown as SavedGenerationRun;
}

async function seedBaseline(
  repository: AuthorBaselineRepository,
  authorUsername: string,
  baselineVelocity: number,
) {
  await repository.save(
    authorBaselineSchema.parse({
      authorUsername,
      baselineVelocity,
      // A fresh, non-provisional baseline is used directly — the sampler is not called.
      sampleSize: 20,
      computedAt: fixedNowIso,
    }),
  );
}

function buildHarness(depOverrides: Partial<DiscoverySweepDependencies> = {}) {
  const seenTweet = createInMemorySeenTweetRepository(owner, new Map());
  const authorBaseline = createInMemoryAuthorBaselineRepository(owner, new Map());
  const newsCoverageCluster = createInMemoryNewsCoverageClusterRepository(owner, new Map());
  const composeCalls: ComposeAutomatedRunInput[] = [];
  const capDrops: DiscoverySweepLogEntry[] = [];
  let clusterSeq = 0;

  const composeRun: typeof composeAutomatedRun = async (input) => {
    composeCalls.push(input);

    return { run: fakeRun(`run-${input.newsCoverageClusterId}`) };
  };

  function nextClusterId() {
    clusterSeq += 1;

    return `cluster-${clusterSeq}`;
  }

  async function runSweep(
    tweets: DiscoveredTweet[],
    overrides: Partial<DiscoverySweepDependencies> = {},
  ) {
    return runDiscoverySweep(
      {
        listIds: ["list-1"],
        window: { since: new Date(windowSinceIso), until: new Date(fixedNowIso) },
      },
      {
        isReady: async () => true,
        readListTimeline: async (input) => ({
          listIds: input.listIds,
          window: input.window,
          tweets,
        }),
        resolveRepositories: async () => ({
          repositories: { seenTweet, authorBaseline, newsCoverageCluster },
        }),
        sampler: async () => [],
        composeRun,
        newsworthinessJudge: createLocalNewsworthinessJudge("local-test"),
        logger: (entry) => capDrops.push(entry),
        now: () => new Date(fixedNowIso),
        createClusterId: nextClusterId,
        // No allowlist by default so the per-sweep Primary Operator log stays silent;
        // the dedicated test below configures one to exercise it.
        env: {},
        ...depOverrides,
        ...overrides,
      },
    );
  }

  return { seenTweet, authorBaseline, newsCoverageCluster, composeCalls, capDrops, runSweep };
}

function expectCompleted(result: Awaited<ReturnType<typeof runDiscoverySweep>>) {
  if (result.status !== "completed") {
    throw new Error(`Expected a completed sweep, got "${result.status}".`);
  }

  return result;
}

describe("runDiscoverySweep", () => {
  test("composes the pipeline end to end and starts one Automated Run per surviving cluster", async () => {
    const harness = buildHarness();

    await seedBaseline(harness.authorBaseline, "acme", 0.5);
    await seedBaseline(harness.authorBaseline, "bravo", 0.5);
    await seedBaseline(harness.authorBaseline, "delphic", 0.5);
    await seedBaseline(harness.authorBaseline, "noise", 0.5);
    // Echo's normal is high, so its modest tweet never clears the bar.
    await seedBaseline(harness.authorBaseline, "echo", 1_000);

    const result = expectCompleted(
      await harness.runSweep([acmeTweet, bravoTweet, delphicTweet, noiseTweet, echoTweet]),
    );

    // One run per surviving cluster, ranked by virality (Acme > Bravo > Delphic).
    expect(result.startedRuns.map((run) => run.sourceTweetId)).toEqual([
      "tweet-acme",
      "tweet-bravo",
      "tweet-delphic",
    ]);
    expect(result.startedRuns.map((run) => run.authorRelativeScore)).toEqual([1400, 560, 220]);
    expect(result.droppedByCap).toEqual([]);
    expect(result.joinedExistingClusters).toBe(0);

    // The composition pipeline was invoked once per kept cluster, in virality order,
    // each linked to its newly-formed cluster.
    expect(harness.composeCalls.map((call) => call.sourceTweetUrl)).toEqual([
      acmeTweet.url,
      bravoTweet.url,
      delphicTweet.url,
    ]);
    expect(harness.composeCalls.map((call) => call.newsCoverageClusterId)).toEqual([
      "cluster-1",
      "cluster-2",
      "cluster-3",
    ]);

    // Each surviving cluster is persisted and linked to the run it produced.
    const clusters = await harness.newsCoverageCluster.listRecent(windowSinceIso);
    expect(clusters.map((cluster) => cluster.sourceTweetId).sort()).toEqual([
      "tweet-acme",
      "tweet-bravo",
      "tweet-delphic",
    ]);
    expect(clusters.every((cluster) => cluster.runId !== null)).toBe(true);

    // Run members and the newsworthiness-rejected noise tweet are recorded seen; the
    // non-qualifying Echo tweet is left unseen for a later sweep to reconsider.
    const stillUnseen = await harness.seenTweet.filterUnseen([
      "tweet-acme",
      "tweet-bravo",
      "tweet-delphic",
      "tweet-noise",
      "tweet-echo",
    ]);
    expect(stillUnseen).toEqual(["tweet-echo"]);
  });

  test("starts no run for a tweet that joins an already-run cluster on an overlapping sweep", async () => {
    const harness = buildHarness();

    await seedBaseline(harness.authorBaseline, "acme", 0.5);

    // First sweep: the Acme news forms a cluster and starts its run.
    const first = expectCompleted(await harness.runSweep([acmeTweet]));
    expect(first.startedRuns.map((run) => run.sourceTweetId)).toEqual(["tweet-acme"]);

    // Second, overlapping sweep: the original tweet is re-listed (now seen) alongside a
    // fresh, similar tweet about the same news posted half an hour ago.
    const acmeFollowup = buildTweet({
      id: "tweet-acme-2",
      username: "acme",
      text: ACME_NEWS_FOLLOWUP,
      reposts: 120,
      likes: 60,
      createdAt: halfHourAgoIso,
    });

    const second = expectCompleted(await harness.runSweep([acmeTweet, acmeFollowup]));

    // The follow-up joins the already-run cluster; no second run starts.
    expect(second.startedRuns).toEqual([]);
    expect(second.joinedExistingClusters).toBe(1);
    // Compose ran exactly once across both sweeps.
    expect(harness.composeCalls).toHaveLength(1);
    // Still a single cluster for the event.
    const clusters = await harness.newsCoverageCluster.listRecent(windowSinceIso);
    expect(clusters).toHaveLength(1);
  });

  test("caps runs at the configured maximum, ranking by virality and logging every drop", async () => {
    const harness = buildHarness({ config: { maxRunsPerSweep: 2, minFaves: 0, minReposts: 0 } });

    await seedBaseline(harness.authorBaseline, "acme", 0.5);
    await seedBaseline(harness.authorBaseline, "bravo", 0.5);
    await seedBaseline(harness.authorBaseline, "delphic", 0.5);

    const result = expectCompleted(await harness.runSweep([acmeTweet, bravoTweet, delphicTweet]));

    // Only the two most viral clusters start runs.
    expect(result.startedRuns.map((run) => run.sourceTweetId)).toEqual([
      "tweet-acme",
      "tweet-bravo",
    ]);
    expect(harness.composeCalls).toHaveLength(2);

    // The dropped cluster is reported and logged, never silently truncated.
    expect(result.droppedByCap).toEqual([
      {
        sourceTweetId: "tweet-delphic",
        sourceText: DELPHIC_NEWS,
        authorRelativeScore: 220,
      },
    ]);
    expect(harness.capDrops).toEqual([
      {
        event: "cap-drop",
        cap: 2,
        sourceTweetId: "tweet-delphic",
        sourceText: DELPHIC_NEWS,
        authorRelativeScore: 220,
      },
    ]);

    // The dropped cluster is neither persisted nor recorded seen — a later sweep may
    // still reconsider it while it remains in the trailing window.
    const clusters = await harness.newsCoverageCluster.listRecent(windowSinceIso);
    expect(clusters.map((cluster) => cluster.sourceTweetId).sort()).toEqual([
      "tweet-acme",
      "tweet-bravo",
    ]);
    expect(await harness.seenTweet.filterUnseen(["tweet-delphic"])).toEqual(["tweet-delphic"]);
  });

  test("starts nothing when the Runtime Readiness Gate is not ready", async () => {
    const harness = buildHarness({ isReady: async () => false });

    await seedBaseline(harness.authorBaseline, "acme", 0.5);

    const result = await harness.runSweep([acmeTweet, bravoTweet]);

    expect(result.status).toBe("not-ready");
    expect(harness.composeCalls).toEqual([]);
    expect(await harness.newsCoverageCluster.listRecent(windowSinceIso)).toEqual([]);
    expect(await harness.seenTweet.filterUnseen(["tweet-acme", "tweet-bravo"])).toEqual([
      "tweet-acme",
      "tweet-bravo",
    ]);
  });

  test("starts nothing when no Operator Account can be resolved", async () => {
    const harness = buildHarness({ resolveRepositories: async () => ({ unauthorized: true }) });

    const result = await harness.runSweep([acmeTweet]);

    expect(result.status).toBe("unauthorized");
    expect(harness.composeCalls).toEqual([]);
  });

  test("logs the Primary Operator (the first allowlist entry, normalized) it anchors under", async () => {
    const harness = buildHarness();

    // Two allowlisted operators: the sweep anchors under — and logs — the first,
    // normalized to lower-case so config drift in the load-bearing entry is visible.
    await harness.runSweep([], {
      env: { OPERATOR_ALLOWLISTED_EMAILS: "Primary@Example.com, second@example.com" },
    });

    expect(harness.capDrops).toContainEqual({
      event: "primary-operator",
      email: "primary@example.com",
    });
  });
});
