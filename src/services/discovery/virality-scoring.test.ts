import { describe, expect, test } from "vitest";
import {
  type ScorableTweet,
  scoreTweetVelocity,
  type TweetEngagementMetrics,
  tweetAgeHours,
  type VelocityScore,
  weightedEngagement,
} from "@/services/discovery";

const nowMs = Date.parse("2026-06-16T12:00:00.000Z");

function metrics(overrides: Partial<TweetEngagementMetrics> = {}): TweetEngagementMetrics {
  return { replies: 0, reposts: 0, quotes: 0, likes: 0, views: 0, ...overrides };
}

function tweet(ageHours: number, overrides: Partial<TweetEngagementMetrics> = {}): ScorableTweet {
  return {
    createdAt: new Date(nowMs - ageHours * 3_600_000).toISOString(),
    metrics: metrics(overrides),
  };
}

describe("weightedEngagement", () => {
  test("weights reposts strongest, then quotes, then likes, then replies", () => {
    const count = 10;
    const reposts = weightedEngagement(metrics({ reposts: count }));
    const quotes = weightedEngagement(metrics({ quotes: count }));
    const likes = weightedEngagement(metrics({ likes: count }));
    const replies = weightedEngagement(metrics({ replies: count }));

    expect(reposts).toBeGreaterThan(quotes);
    expect(quotes).toBeGreaterThan(likes);
    expect(likes).toBeGreaterThan(replies);
  });

  test("excludes views — reach is not engagement", () => {
    expect(weightedEngagement(metrics({ views: 1_000_000 }))).toBe(0);
  });

  test("sums each interaction at its weight", () => {
    expect(weightedEngagement(metrics({ reposts: 2, quotes: 1, likes: 4, replies: 2 }))).toBe(
      2 * 3 + 1 * 2 + 4 * 1 + 2 * 0.5,
    );
  });
});

describe("tweetAgeHours", () => {
  test("returns the elapsed hours for a past tweet", () => {
    expect(tweetAgeHours(new Date(nowMs - 5 * 3_600_000).toISOString(), nowMs)).toBeCloseTo(5);
  });

  test("floors a brand-new tweet at minAgeHours so velocity never divides by ~0", () => {
    expect(tweetAgeHours(new Date(nowMs).toISOString(), nowMs)).toBe(1);
  });

  test("floors a future-dated tweet at minAgeHours rather than going negative", () => {
    expect(tweetAgeHours(new Date(nowMs + 3 * 3_600_000).toISOString(), nowMs)).toBe(1);
  });

  test("falls back to minAgeHours for an unparseable timestamp", () => {
    expect(tweetAgeHours("not-a-date", nowMs)).toBe(1);
  });
});

describe("scoreTweetVelocity", () => {
  test("velocity is weighted engagement over age", () => {
    const score: VelocityScore = scoreTweetVelocity(tweet(10, { likes: 100 }), { nowMs });

    expect(score.weightedEngagement).toBe(100);
    expect(score.ageHours).toBeCloseTo(10);
    expect(score.velocity).toBeCloseTo(10);
  });

  test("age normalization: the same engagement decays as the tweet ages", () => {
    const fresh = scoreTweetVelocity(tweet(2, { likes: 100 }), { nowMs });
    const old = scoreTweetVelocity(tweet(20, { likes: 100 }), { nowMs });

    expect(fresh.velocity).toBeGreaterThan(old.velocity);
    expect(fresh.velocity).toBeCloseTo(old.velocity * 10);
  });
});
