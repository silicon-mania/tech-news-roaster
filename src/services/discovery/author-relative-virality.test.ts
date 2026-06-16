import { describe, expect, test } from "vitest";
import {
  type AuthorBaseline,
  type AuthorRelativeViralityScore,
  defaultViralityConfig,
  type ScorableTweet,
  scoreAuthorRelativeVirality,
  type ViralityConfig,
} from "@/services/discovery";

const nowMs = Date.parse("2026-06-16T12:00:00.000Z");

// 10h age throughout, so a tweet's velocity equals its weighted engagement / 10.
function tweet(overrides: Partial<ScorableTweet["metrics"]>): ScorableTweet {
  return {
    createdAt: new Date(nowMs - 10 * 3_600_000).toISOString(),
    metrics: { replies: 0, reposts: 0, quotes: 0, likes: 0, views: 0, ...overrides },
  };
}

function baseline(baselineVelocity: number): AuthorBaseline {
  return {
    authorUsername: "author",
    baselineVelocity,
    sampleSize: 10,
    computedAt: new Date(nowMs).toISOString(),
  };
}

describe("scoreAuthorRelativeVirality", () => {
  test("judges a small account's breakout and a megaccount's routine post fairly", () => {
    // Small account: normal velocity 1, a post at velocity 10 — a 10x breakout.
    const small = scoreAuthorRelativeVirality(tweet({ likes: 100 }), baseline(1), { nowMs });
    // Megaccount: normal velocity 1000, a post at velocity 1200 — routine for them.
    const mega = scoreAuthorRelativeVirality(tweet({ likes: 12_000 }), baseline(1_000), { nowMs });

    expect(small.authorRelativeScore).toBeCloseTo(10);
    expect(mega.authorRelativeScore).toBeCloseTo(1.2);
    // Despite far fewer absolute likes, the small account scores higher and clears
    // the bar while the megaccount's bigger-but-normal post does not.
    expect(small.authorRelativeScore).toBeGreaterThan(mega.authorRelativeScore);
    expect(small.qualifies).toBe(true);
    expect(mega.qualifies).toBe(false);
  });

  test("repost weighting can carry a tweet over the bar that likes alone would not", () => {
    const viaReposts: AuthorRelativeViralityScore = scoreAuthorRelativeVirality(
      tweet({ reposts: 10 }),
      baseline(1),
      { nowMs },
    );
    const viaLikes = scoreAuthorRelativeVirality(tweet({ likes: 10 }), baseline(1), { nowMs });

    expect(viaReposts.qualifies).toBe(true);
    expect(viaLikes.qualifies).toBe(false);
    expect(viaReposts.authorRelativeScore).toBeGreaterThan(viaLikes.authorRelativeScore);
  });

  test("qualifies at exactly the bar (inclusive)", () => {
    // velocity 2 against baseline 1 with the default bar of 2.
    const score = scoreAuthorRelativeVirality(tweet({ likes: 20 }), baseline(1), { nowMs });

    expect(score.authorRelativeScore).toBeCloseTo(defaultViralityConfig.viralityBar);
    expect(score.qualifies).toBe(true);
  });

  test("a lower bar favors recall — a borderline tweet that the default rejects passes", () => {
    const recallConfig: ViralityConfig = { ...defaultViralityConfig, viralityBar: 1.2 };
    const borderlineTweet = tweet({ likes: 15 }); // velocity 1.5 against baseline 1

    expect(scoreAuthorRelativeVirality(borderlineTweet, baseline(1), { nowMs }).qualifies).toBe(
      false,
    );
    expect(
      scoreAuthorRelativeVirality(borderlineTweet, baseline(1), { nowMs, config: recallConfig })
        .qualifies,
    ).toBe(true);
  });

  test("floors a near-zero baseline so it cannot make every tweet infinitely viral", () => {
    const score = scoreAuthorRelativeVirality(tweet({ likes: 10 }), baseline(0), { nowMs });

    // velocity 1 / minBaselineVelocity 0.5 = 2, not Infinity.
    expect(score.authorRelativeScore).toBeCloseTo(1 / defaultViralityConfig.minBaselineVelocity);
    expect(Number.isFinite(score.authorRelativeScore)).toBe(true);
  });
});
