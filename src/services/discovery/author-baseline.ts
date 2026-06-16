import { z } from "zod";
import { defaultViralityConfig, type ViralityConfig } from "./virality-config";
import { type ScorableTweet, scoreTweetVelocity } from "./virality-scoring";

/**
 * An author's normal engagement velocity — the yardstick author-relative virality
 * normalizes against, so a small founder's breakout and a megaccount's post are each
 * judged against their own author's normal rather than one global threshold. A
 * `sampleSize` of 0 marks a provisional baseline (no usable sample yet) that is
 * always recomputed on the next encounter.
 */
export const authorBaselineSchema = z
  .object({
    authorUsername: z.string().min(1),
    baselineVelocity: z.number().nonnegative(),
    sampleSize: z.number().int().nonnegative(),
    computedAt: z.string().datetime(),
  })
  .strict();

export type AuthorBaseline = z.infer<typeof authorBaselineSchema>;

/**
 * Computes an author's baseline as the MEDIAN velocity across a sample of their
 * recent tweets — median, not mean, so the author's own occasional viral outlier
 * does not inflate their normal. An empty sample yields a provisional baseline at
 * the documented default velocity.
 */
export function computeAuthorBaseline(
  authorUsername: string,
  sample: ScorableTweet[],
  { nowMs, config = defaultViralityConfig }: { nowMs: number; config?: ViralityConfig },
): AuthorBaseline {
  const velocities = sample
    .map((tweet) => scoreTweetVelocity(tweet, { nowMs, config }).velocity)
    .filter((velocity) => Number.isFinite(velocity))
    .sort((left, right) => left - right);
  const baselineVelocity =
    velocities.length > 0 ? median(velocities) : config.provisionalBaselineVelocity;

  return authorBaselineSchema.parse({
    authorUsername,
    baselineVelocity,
    sampleSize: velocities.length,
    computedAt: new Date(nowMs).toISOString(),
  });
}

/**
 * Whether a baseline should be recomputed: provisional baselines (no sample) are
 * always stale, otherwise once older than the refresh cadence.
 */
export function isBaselineStale(
  baseline: AuthorBaseline,
  nowMs: number,
  refreshHours: number = defaultViralityConfig.baselineRefreshHours,
): boolean {
  if (baseline.sampleSize === 0) {
    return true;
  }

  const ageHours = (nowMs - Date.parse(baseline.computedAt)) / 3_600_000;

  return !Number.isFinite(ageHours) || ageHours >= refreshHours;
}

function median(sortedValues: number[]): number {
  const middle = Math.floor(sortedValues.length / 2);

  if (sortedValues.length % 2 === 1) {
    return sortedValues[middle];
  }

  return (sortedValues[middle - 1] + sortedValues[middle]) / 2;
}
