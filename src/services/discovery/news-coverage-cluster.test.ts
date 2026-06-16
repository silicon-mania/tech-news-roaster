import { describe, expect, test } from "vitest";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import {
  type ClusterableTweet,
  chooseClusterSourceTweet,
  parseNewsCoverageCluster,
  toClusterableTweet,
} from "./news-coverage-cluster";

function tweet(overrides: Partial<ClusterableTweet> & { id: string }): ClusterableTweet {
  return {
    text: "OpenAI ships an agent workspace.",
    createdAt: "2026-06-05T10:00:00.000Z",
    hasMedia: false,
    authorAuthority: 0,
    ...overrides,
  };
}

describe("chooseClusterSourceTweet", () => {
  test("prefers the earliest qualifying tweet", () => {
    const source = chooseClusterSourceTweet([
      tweet({ id: "late", createdAt: "2026-06-05T11:00:00.000Z" }),
      tweet({ id: "early", createdAt: "2026-06-05T09:30:00.000Z" }),
      tweet({ id: "mid", createdAt: "2026-06-05T10:15:00.000Z" }),
    ]);

    expect(source.id).toBe("early");
  });

  test("breaks a recency tie toward media presence", () => {
    const source = chooseClusterSourceTweet([
      tweet({ id: "no-media", hasMedia: false, authorAuthority: 99 }),
      tweet({ id: "with-media", hasMedia: true, authorAuthority: 1 }),
    ]);

    expect(source.id).toBe("with-media");
  });

  test("breaks a recency-and-media tie toward author authority", () => {
    const source = chooseClusterSourceTweet([
      tweet({ id: "low", hasMedia: true, authorAuthority: 2 }),
      tweet({ id: "high", hasMedia: true, authorAuthority: 9 }),
    ]);

    expect(source.id).toBe("high");
  });

  test("is deterministic when every signal ties, falling back to id", () => {
    const source = chooseClusterSourceTweet([
      tweet({ id: "b", hasMedia: true, authorAuthority: 5 }),
      tweet({ id: "a", hasMedia: true, authorAuthority: 5 }),
    ]);

    expect(source.id).toBe("a");
  });

  test("throws on an empty member list", () => {
    expect(() => chooseClusterSourceTweet([])).toThrow();
  });
});

describe("toClusterableTweet", () => {
  test("marks media presence from the source tweet's own references", () => {
    const { sourceTweet } = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    expect(toClusterableTweet(sourceTweet, { authorAuthority: 4 })).toMatchObject({
      id: sourceTweet.id,
      text: sourceTweet.text,
      createdAt: sourceTweet.createdAt,
      hasMedia: true,
      authorAuthority: 4,
    });
  });
});

describe("parseNewsCoverageCluster", () => {
  test("accepts a well-formed cluster with a null run link", () => {
    expect(
      parseNewsCoverageCluster({
        id: "cluster-1",
        sourceTweetId: "tweet-1",
        sourceText: "OpenAI ships an agent workspace.",
        memberTweetIds: ["tweet-1", "tweet-2"],
        earliestCreatedAt: "2026-06-05T10:00:00.000Z",
        runId: null,
        createdAt: "2026-06-05T10:05:00.000Z",
        updatedAt: "2026-06-05T10:05:00.000Z",
      }),
    ).toMatchObject({ id: "cluster-1", runId: null });
  });

  test("rejects a cluster with no members", () => {
    expect(() =>
      parseNewsCoverageCluster({
        id: "cluster-1",
        sourceTweetId: "tweet-1",
        sourceText: "OpenAI ships an agent workspace.",
        memberTweetIds: [],
        earliestCreatedAt: "2026-06-05T10:00:00.000Z",
        runId: null,
        createdAt: "2026-06-05T10:05:00.000Z",
        updatedAt: "2026-06-05T10:05:00.000Z",
      }),
    ).toThrow();
  });
});
