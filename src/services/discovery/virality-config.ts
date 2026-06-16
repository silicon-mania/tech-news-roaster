/**
 * Documented defaults for author-relative virality scoring (issue 015). These are
 * deliberately recall-favoring starting values, not tuned thresholds: exact tuning
 * — the virality bar, the baseline refresh cadence, the engagement weights — is
 * deferred to issue 021 (see docs/adr/0020-automated-discovery-via-api-list-polling.md).
 */

/** Per-interaction weights for the engagement sum. Reposts dominate by design. */
export type ViralityWeights = {
  replies: number;
  reposts: number;
  quotes: number;
  likes: number;
};

export type ViralityConfig = {
  /**
   * Engagement weights. Reposts are weighted strongest: a repost is an
   * unqualified rebroadcast of the claim to a new audience — the clearest signal
   * that news is spreading. Quotes amplify too, with commentary; likes and
   * replies are weaker. Views are reach, not engagement, so they are excluded.
   */
  weights: ViralityWeights;
  /**
   * Floor on a tweet's age (hours) before it divides engagement. Without it a
   * brand-new tweet would divide by ~0 and read as infinitely viral.
   */
  minAgeHours: number;
  /**
   * Floor on an author's baseline velocity before it normalizes a tweet. Keeps an
   * author whose normal is ~0 from making every tweet score as infinite, but stays
   * small so genuine small-account breakouts still clear the bar.
   */
  minBaselineVelocity: number;
  /**
   * Velocity used for an author with no usable sample yet. Deliberately low so
   * unknown authors lean toward qualifying (recall over precision) until a real
   * baseline is computed.
   */
  provisionalBaselineVelocity: number;
  /**
   * Qualification bar: a tweet qualifies when its velocity is at least this
   * multiple of the author's baseline velocity. Low on purpose — better to run on
   * a tweet that fizzles than to miss real news.
   */
  viralityBar: number;
  /** How many of an author's recent tweets to sample for their baseline. */
  baselineSampleSize: number;
  /**
   * A baseline older than this many hours is recomputed on next encounter. An
   * author's normal drifts slowly, so a coarse weekly cadence keeps API cost low.
   */
  baselineRefreshHours: number;
};

export const defaultViralityConfig: ViralityConfig = {
  weights: {
    reposts: 3,
    quotes: 2,
    likes: 1,
    replies: 0.5,
  },
  minAgeHours: 1,
  minBaselineVelocity: 0.5,
  provisionalBaselineVelocity: 0.5,
  viralityBar: 2,
  baselineSampleSize: 20,
  baselineRefreshHours: 24 * 7,
};
