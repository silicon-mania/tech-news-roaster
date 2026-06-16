import type { AuthorBaseline } from "./author-baseline";
import { defaultViralityConfig, type ViralityConfig } from "./virality-config";
import { type ScorableTweet, scoreTweetVelocity } from "./virality-scoring";

/**
 * A tweet's virality judged against its author's own baseline. `authorRelativeScore`
 * is the tweet's velocity as a multiple of the author's normal; `qualifies` applies
 * the recall-favoring bar to it.
 */
export type AuthorRelativeViralityScore = {
  velocity: number;
  baselineVelocity: number;
  authorRelativeScore: number;
  qualifies: boolean;
};

/**
 * The pure author-relative score: normalize the tweet's velocity by the author's
 * baseline (floored so a near-zero baseline cannot make every tweet infinite) and
 * apply the qualification bar. Data-in, data-out — no persistence.
 */
export function scoreAuthorRelativeVirality(
  tweet: ScorableTweet,
  baseline: AuthorBaseline,
  { nowMs, config = defaultViralityConfig }: { nowMs: number; config?: ViralityConfig },
): AuthorRelativeViralityScore {
  const { velocity } = scoreTweetVelocity(tweet, { nowMs, config });
  const denominator = Math.max(baseline.baselineVelocity, config.minBaselineVelocity);
  const authorRelativeScore = velocity / denominator;

  return {
    velocity,
    baselineVelocity: baseline.baselineVelocity,
    authorRelativeScore,
    qualifies: authorRelativeScore >= config.viralityBar,
  };
}
