import { describe, expect, test } from "vitest";
import {
  type AuthorBaseline,
  authorBaselineSchema,
  computeAuthorBaseline,
  defaultViralityConfig,
  isBaselineStale,
  type ScorableTweet,
} from "@/services/discovery";

const nowMs = Date.parse("2026-06-16T12:00:00.000Z");

// All sample tweets share a 10h age so a tweet's velocity equals likes / 10 — the
// median assertions below are then exact and easy to reason about.
function sampleTweet(likes: number): ScorableTweet {
  return {
    createdAt: new Date(nowMs - 10 * 3_600_000).toISOString(),
    metrics: { replies: 0, reposts: 0, quotes: 0, likes, views: 0 },
  };
}

describe("computeAuthorBaseline", () => {
  test("uses the median velocity so one viral outlier does not inflate the normal", () => {
    // Velocities are [1, 2, 3, 100]; median is 2.5 while the mean would be 26.5.
    const baseline = computeAuthorBaseline(
      "founder",
      [sampleTweet(10), sampleTweet(20), sampleTweet(30), sampleTweet(1_000)],
      { nowMs },
    );

    expect(baseline.baselineVelocity).toBeCloseTo(2.5);
    expect(baseline.sampleSize).toBe(4);
    expect(baseline.authorUsername).toBe("founder");
    expect(baseline.computedAt).toBe(new Date(nowMs).toISOString());
  });

  test("an odd-sized sample takes the middle velocity", () => {
    const baseline = computeAuthorBaseline(
      "founder",
      [sampleTweet(10), sampleTweet(20), sampleTweet(30)],
      {
        nowMs,
      },
    );

    expect(baseline.baselineVelocity).toBeCloseTo(2);
  });

  test("an empty sample yields a provisional baseline at the documented default", () => {
    const baseline = computeAuthorBaseline("ghost", [], { nowMs });

    expect(baseline.sampleSize).toBe(0);
    expect(baseline.baselineVelocity).toBe(defaultViralityConfig.provisionalBaselineVelocity);
  });

  test("produces a value that round-trips through the persistence schema", () => {
    const baseline = computeAuthorBaseline("founder", [sampleTweet(10)], { nowMs });

    expect(() => authorBaselineSchema.parse(baseline)).not.toThrow();
  });
});

describe("isBaselineStale", () => {
  const fresh: AuthorBaseline = {
    authorUsername: "founder",
    baselineVelocity: 3,
    sampleSize: 5,
    computedAt: new Date(nowMs).toISOString(),
  };

  test("a freshly computed real baseline is not stale", () => {
    expect(isBaselineStale(fresh, nowMs)).toBe(false);
  });

  test("a provisional baseline (no sample) is always stale so it keeps retrying", () => {
    expect(isBaselineStale({ ...fresh, sampleSize: 0 }, nowMs)).toBe(true);
  });

  test("a baseline older than the refresh cadence is stale", () => {
    const eightDaysAgo = new Date(nowMs - 8 * 24 * 3_600_000).toISOString();

    expect(isBaselineStale({ ...fresh, computedAt: eightDaysAgo }, nowMs)).toBe(true);
  });
});
