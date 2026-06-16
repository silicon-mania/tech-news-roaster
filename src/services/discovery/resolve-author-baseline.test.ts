import { describe, expect, test } from "vitest";
import {
  type AuthorBaseline,
  type AuthorTweetSampler,
  createInMemoryAuthorBaselineRepository,
  fixtureAuthorTweetSampler,
  qualifyTweetVirality,
  resolveAuthorBaseline,
  type ScorableTweet,
  type TweetViralityQualification,
} from "@/services/discovery";
import type { RetrievedSourceTweet } from "@/services/tweet-retrieval";

const nowMs = Date.parse("2026-06-16T12:00:00.000Z");

function sampleTweet(likes: number): ScorableTweet {
  return {
    createdAt: new Date(nowMs - 10 * 3_600_000).toISOString(),
    metrics: { replies: 0, reposts: 0, quotes: 0, likes, views: 0 },
  };
}

function countingSampler(sample: ScorableTweet[]) {
  let calls = 0;
  const sampler: AuthorTweetSampler = async () => {
    calls += 1;
    return sample;
  };

  return { sampler, calls: () => calls };
}

const throwingSampler: AuthorTweetSampler = async () => {
  throw new Error("sampler unavailable");
};

function freshRepo() {
  return createInMemoryAuthorBaselineRepository("operator-1", new Map());
}

describe("resolveAuthorBaseline", () => {
  test("computes a baseline lazily and persists it when none exists", async () => {
    const repository = freshRepo();
    const { sampler, calls } = countingSampler([sampleTweet(10), sampleTweet(20), sampleTweet(30)]);

    const baseline = await resolveAuthorBaseline({
      authorUsername: "founder",
      repository,
      sampler,
      nowMs,
    });

    expect(calls()).toBe(1);
    expect(baseline.sampleSize).toBe(3);
    expect(await repository.get("founder")).toEqual(baseline);
  });

  test("returns a fresh stored baseline without resampling", async () => {
    const repository = freshRepo();
    const stored: AuthorBaseline = {
      authorUsername: "founder",
      baselineVelocity: 4,
      sampleSize: 5,
      computedAt: new Date(nowMs).toISOString(),
    };
    await repository.save(stored);
    const { sampler, calls } = countingSampler([sampleTweet(10)]);

    const baseline = await resolveAuthorBaseline({
      authorUsername: "founder",
      repository,
      sampler,
      nowMs,
    });

    expect(calls()).toBe(0);
    expect(baseline).toEqual(stored);
  });

  test("recomputes a stale stored baseline", async () => {
    const repository = freshRepo();
    await repository.save({
      authorUsername: "founder",
      baselineVelocity: 4,
      sampleSize: 5,
      computedAt: new Date(nowMs - 8 * 24 * 3_600_000).toISOString(),
    });
    const { sampler, calls } = countingSampler([sampleTweet(50), sampleTweet(70)]);

    const baseline = await resolveAuthorBaseline({
      authorUsername: "founder",
      repository,
      sampler,
      nowMs,
    });

    expect(calls()).toBe(1);
    expect(baseline.sampleSize).toBe(2);
    expect(baseline.computedAt).toBe(new Date(nowMs).toISOString());
  });

  test("keeps a stale baseline when the sampler fails (best-effort refresh)", async () => {
    const repository = freshRepo();
    const stale: AuthorBaseline = {
      authorUsername: "founder",
      baselineVelocity: 4,
      sampleSize: 5,
      computedAt: new Date(nowMs - 8 * 24 * 3_600_000).toISOString(),
    };
    await repository.save(stale);

    const baseline = await resolveAuthorBaseline({
      authorUsername: "founder",
      repository,
      sampler: throwingSampler,
      nowMs,
    });

    expect(baseline).toEqual(stale);
  });

  test("falls back to a provisional baseline when the sampler fails and none exists", async () => {
    const repository = freshRepo();

    const baseline = await resolveAuthorBaseline({
      authorUsername: "founder",
      repository,
      sampler: throwingSampler,
      nowMs,
    });

    expect(baseline.sampleSize).toBe(0);
    expect(await repository.get("founder")).toEqual(baseline);
  });
});

describe("qualifyTweetVirality", () => {
  function discoveredTweet(likes: number): RetrievedSourceTweet {
    return {
      id: "tweet-1",
      url: "https://x.com/founder/status/tweet-1",
      text: "A small lab just leapfrogged the frontier and nobody saw it coming.",
      createdAt: new Date(nowMs - 10 * 3_600_000).toISOString(),
      author: { username: "founder", displayName: "Founder" },
      metrics: { replies: 0, reposts: 0, quotes: 0, likes, views: 0 },
      mediaReferences: [],
    } satisfies RetrievedSourceTweet;
  }

  test("resolves the author's baseline and scores the tweet against it", async () => {
    const repository = freshRepo();
    const { sampler } = countingSampler([sampleTweet(10), sampleTweet(10)]); // baseline velocity 1

    const result: TweetViralityQualification = await qualifyTweetVirality({
      tweet: discoveredTweet(100), // velocity 10
      repository,
      sampler,
      nowMs,
    });

    expect(result.baseline.authorUsername).toBe("founder");
    expect(result.authorRelativeScore).toBeCloseTo(10);
    expect(result.qualifies).toBe(true);
    expect(await repository.get("founder")).toEqual(result.baseline);
  });

  test("works end-to-end with the fixture sampler", async () => {
    const repository = freshRepo();

    const result = await qualifyTweetVirality({
      tweet: discoveredTweet(5_000),
      repository,
      sampler: fixtureAuthorTweetSampler,
      nowMs,
    });

    expect(result.baseline.sampleSize).toBeGreaterThan(0);
    expect(typeof result.qualifies).toBe("boolean");
  });
});
