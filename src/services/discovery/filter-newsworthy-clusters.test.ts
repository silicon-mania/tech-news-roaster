import { describe, expect, test } from "vitest";
import { clusterViralTweets } from "./cluster-viral-tweets";
import { filterNewsworthyClusters } from "./filter-newsworthy-clusters";
import { createInMemorySeenTweetRepository } from "./in-memory-seen-tweet-repository";
import type { ClusterableTweet } from "./news-coverage-cluster";
import { createLocalNewsworthinessJudge, type NewsworthinessJudge } from "./newsworthiness-filter";

function tweet(
  overrides: Partial<ClusterableTweet> & { id: string; text: string },
): ClusterableTweet {
  return {
    createdAt: "2026-06-05T10:00:00.000Z",
    hasMedia: false,
    authorAuthority: 0,
    ...overrides,
  };
}

function seenTweetRepository() {
  return createInMemorySeenTweetRepository("operator", new Map());
}

describe("filterNewsworthyClusters", () => {
  test("accepts tech-news clusters and rejects off-topic noise clusters", async () => {
    const { newClusters } = clusterViralTweets([
      tweet({ id: "news", text: "OpenAI launches GPT-5.4 with a new agents API for developers." }),
      tweet({
        id: "meme",
        text: "lmaooo this meme is killing me 💀 who else cannot stop laughing",
        createdAt: "2026-06-05T20:00:00.000Z",
      }),
    ]);

    const plan = await filterNewsworthyClusters(newClusters, {
      judge: createLocalNewsworthinessJudge(),
      seenTweetRepository: seenTweetRepository(),
    });

    expect(plan.accepted.map((cluster) => cluster.sourceTweet.id)).toEqual(["news"]);
    expect(plan.rejected.map(({ cluster }) => cluster.sourceTweet.id)).toEqual(["meme"]);
    expect(plan.rejected[0].reason).toMatch(/dropped/i);
  });

  test("records a rejected cluster's tweets so a later sweep neither surfaces nor re-evaluates them", async () => {
    const repository = seenTweetRepository();
    const { newClusters } = clusterViralTweets([
      tweet({
        id: "drama-1",
        text: "the drama at brunch today, my ex really showed up 😭 unreal",
      }),
      tweet({
        id: "drama-2",
        text: "still cannot believe the brunch drama, my ex is wild",
        createdAt: "2026-06-05T10:05:00.000Z",
      }),
    ]);

    const plan = await filterNewsworthyClusters(newClusters, {
      judge: createLocalNewsworthinessJudge(),
      seenTweetRepository: repository,
    });

    expect(plan.accepted).toEqual([]);
    expect(plan.rejected).toHaveLength(1);

    // Dropped permanently: every member of the rejected cluster is now in the
    // seen-tweet record, so a later overlapping sweep filters them all out.
    const stillUnseen = await repository.filterUnseen(["drama-1", "drama-2"]);
    expect(stillUnseen).toEqual([]);
  });

  test("does not record accepted clusters in the seen-tweet record", async () => {
    const repository = seenTweetRepository();
    const { newClusters } = clusterViralTweets([
      tweet({ id: "news", text: "Stripe acquires a payments startup in a surprise deal." }),
    ]);

    await filterNewsworthyClusters(newClusters, {
      judge: createLocalNewsworthinessJudge(),
      seenTweetRepository: repository,
    });

    // The Automated Run, not the filter, owns when an accepted tweet is recorded.
    expect(await repository.filterUnseen(["news"])).toEqual(["news"]);
  });

  test("keeps a cluster when the judge throws (permissive: never drop on judge failure)", async () => {
    const repository = seenTweetRepository();
    const failingJudge: NewsworthinessJudge = {
      model: "test-model",
      provider: "test",
      async judge() {
        throw new Error("judge exploded");
      },
    };
    const { newClusters } = clusterViralTweets([
      tweet({ id: "meme", text: "lmaooo this is just a meme, no news at all 💀" }),
    ]);

    const plan = await filterNewsworthyClusters(newClusters, {
      judge: failingJudge,
      seenTweetRepository: repository,
    });

    expect(plan.accepted.map((cluster) => cluster.sourceTweet.id)).toEqual(["meme"]);
    expect(plan.rejected).toEqual([]);
    // Kept, so not recorded — a broken judge never silently drops real news.
    expect(await repository.filterUnseen(["meme"])).toEqual(["meme"]);
  });
});
