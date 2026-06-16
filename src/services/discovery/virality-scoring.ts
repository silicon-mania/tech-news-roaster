import type { RetrievedSourceTweet } from "@/services/tweet-retrieval";
import {
  defaultViralityConfig,
  type ViralityConfig,
  type ViralityWeights,
} from "./virality-config";

/** The engagement metrics any scorable tweet carries (the normalized retrieval shape). */
export type TweetEngagementMetrics = RetrievedSourceTweet["metrics"];

/** The minimum a tweet must carry to be scored: when it was posted plus its metrics. */
export type ScorableTweet = Pick<RetrievedSourceTweet, "createdAt" | "metrics">;

export type VelocityScore = {
  weightedEngagement: number;
  ageHours: number;
  velocity: number;
};

const millisecondsPerHour = 3_600_000;

/**
 * The weighted engagement sum, reposts weighted strongest (see {@link ViralityConfig}).
 * Views are intentionally excluded — they measure reach, not engagement.
 */
export function weightedEngagement(
  metrics: TweetEngagementMetrics,
  weights: ViralityWeights = defaultViralityConfig.weights,
): number {
  return (
    metrics.reposts * weights.reposts +
    metrics.quotes * weights.quotes +
    metrics.likes * weights.likes +
    metrics.replies * weights.replies
  );
}

/** A tweet's age in hours, floored at `minAgeHours` so it is never zero or negative. */
export function tweetAgeHours(
  createdAt: string,
  nowMs: number,
  minAgeHours: number = defaultViralityConfig.minAgeHours,
): number {
  const createdMs = Date.parse(createdAt);
  const rawAgeHours = Number.isFinite(createdMs)
    ? (nowMs - createdMs) / millisecondsPerHour
    : minAgeHours;

  return Math.max(rawAgeHours, minAgeHours);
}

/** Velocity = weighted engagement over age. The raw, author-agnostic virality signal. */
export function scoreTweetVelocity(
  tweet: ScorableTweet,
  { nowMs, config = defaultViralityConfig }: { nowMs: number; config?: ViralityConfig },
): VelocityScore {
  const engagement = weightedEngagement(tweet.metrics, config.weights);
  const ageHours = tweetAgeHours(tweet.createdAt, nowMs, config.minAgeHours);

  return {
    weightedEngagement: engagement,
    ageHours,
    velocity: engagement / ageHours,
  };
}
