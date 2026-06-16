import { describe, expect, test } from "vitest";
import { clusterViralTweets, type ExistingClusterRef } from "./cluster-viral-tweets";
import type { ClusterableTweet } from "./news-coverage-cluster";

const hourMs = 60 * 60 * 1000;

function tweet(overrides: Partial<ClusterableTweet> & { id: string }): ClusterableTweet {
  return {
    text: "OpenAI ships an agent workspace for product teams.",
    createdAt: "2026-06-05T10:00:00.000Z",
    hasMedia: false,
    authorAuthority: 0,
    ...overrides,
  };
}

describe("clusterViralTweets — grouping", () => {
  test("groups tweets about the same news into one cluster", () => {
    const plan = clusterViralTweets([
      tweet({ id: "t1", text: "OpenAI launches a new agent workspace for product teams." }),
      tweet({ id: "t2", text: "OpenAI just shipped an agent workspace product, huge for teams." }),
      tweet({ id: "t3", text: "The new OpenAI agent workspace is live for product teams now." }),
    ]);

    expect(plan.newClusters).toHaveLength(1);
    expect(plan.newClusters[0].memberTweetIds.sort()).toEqual(["t1", "t2", "t3"]);
    expect(plan.joinedExisting).toEqual([]);
  });

  test("separates tweets about different news into distinct clusters", () => {
    const plan = clusterViralTweets([
      tweet({ id: "openai", text: "OpenAI ships an agent workspace for product teams." }),
      tweet({ id: "apple", text: "Apple announces a foldable iPhone shipping next spring." }),
    ]);

    expect(plan.newClusters).toHaveLength(2);
  });

  test("does not group similar tweets posted outside the clustering window", () => {
    const plan = clusterViralTweets(
      [
        tweet({ id: "early", createdAt: "2026-06-05T10:00:00.000Z" }),
        tweet({ id: "much-later", createdAt: "2026-06-05T20:00:00.000Z" }),
      ],
      { config: { similarityThreshold: 0.3, clusterWindowMs: 6 * hourMs } },
    );

    expect(plan.newClusters).toHaveLength(2);
  });
});

describe("clusterViralTweets — source tweet selection", () => {
  test("chooses the earliest member as the cluster's Source Tweet", () => {
    const plan = clusterViralTweets([
      tweet({ id: "later", createdAt: "2026-06-05T10:40:00.000Z" }),
      tweet({ id: "earliest", createdAt: "2026-06-05T10:00:00.000Z" }),
      tweet({ id: "middle", createdAt: "2026-06-05T10:20:00.000Z" }),
    ]);

    expect(plan.newClusters[0].sourceTweet.id).toBe("earliest");
    expect(plan.newClusters[0].earliestCreatedAt).toBe("2026-06-05T10:00:00.000Z");
  });

  test("breaks a recency tie toward media, then author authority", () => {
    const at = "2026-06-05T10:00:00.000Z";
    const plan = clusterViralTweets([
      tweet({ id: "no-media", createdAt: at, hasMedia: false, authorAuthority: 99 }),
      tweet({ id: "media-low", createdAt: at, hasMedia: true, authorAuthority: 1 }),
      tweet({ id: "media-high", createdAt: at, hasMedia: true, authorAuthority: 8 }),
    ]);

    expect(plan.newClusters[0].sourceTweet.id).toBe("media-high");
  });
});

describe("clusterViralTweets — no second run", () => {
  const existingCluster: ExistingClusterRef = {
    id: "cluster-openai-workspace",
    sourceText: "OpenAI launches a new agent workspace for product teams.",
    earliestCreatedAt: "2026-06-05T10:00:00.000Z",
    hasRun: true,
  };

  test("a later viral tweet joining an already-run cluster starts no new run", () => {
    const plan = clusterViralTweets(
      [
        tweet({
          id: "late-coverage",
          text: "OpenAI agent workspace for product teams is now live, big launch.",
          createdAt: "2026-06-05T12:00:00.000Z",
        }),
      ],
      { existingClusters: [existingCluster] },
    );

    expect(plan.newClusters).toEqual([]);
    expect(plan.joinedExisting).toEqual([
      { clusterId: "cluster-openai-workspace", tweetId: "late-coverage", clusterHasRun: true },
    ]);
  });

  test("a tweet about unrelated news still forms its own new cluster", () => {
    const plan = clusterViralTweets(
      [
        tweet({
          id: "unrelated",
          text: "Stripe acquires a payments startup in a surprise deal.",
          createdAt: "2026-06-05T12:00:00.000Z",
        }),
      ],
      { existingClusters: [existingCluster] },
    );

    expect(plan.newClusters).toHaveLength(1);
    expect(plan.newClusters[0].sourceTweet.id).toBe("unrelated");
    expect(plan.joinedExisting).toEqual([]);
  });

  test("ten near-duplicate tweets about one event yield exactly one new cluster", () => {
    const plan = clusterViralTweets(
      Array.from({ length: 10 }, (_, index) =>
        tweet({
          id: `dup-${index}`,
          text: `OpenAI agent workspace for product teams launch coverage ${index}.`,
          createdAt: new Date(
            Date.parse("2026-06-05T10:00:00.000Z") + index * 60_000,
          ).toISOString(),
        }),
      ),
    );

    expect(plan.newClusters).toHaveLength(1);
    expect(plan.newClusters[0].memberTweetIds).toHaveLength(10);
  });
});
