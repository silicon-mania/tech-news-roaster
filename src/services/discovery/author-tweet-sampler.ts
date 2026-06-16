import { defaultViralityConfig } from "./virality-config";
import type { ScorableTweet } from "./virality-scoring";

/**
 * Supplies a sample of an author's recent tweets so their baseline can be computed
 * lazily. Injected so issue 015 is buildable and testable against fixtures, and the
 * live retrieval sampler (an unfiltered `from:<author>` window over the provider)
 * can be wired in with the Discovery Sweep (issue 020) without touching the scoring
 * core.
 */
export type AuthorTweetSampler = (authorUsername: string) => Promise<ScorableTweet[]>;

const millisecondsPerHour = 3_600_000;

/**
 * A deterministic local-dev sample: a handful of modest, evenly-aged tweets so a
 * plausible (small) baseline is computed without any provider call. Deterministic —
 * no randomness — so fixtures stay reproducible across runs.
 */
function buildFixtureAuthorSample(
  authorUsername: string,
  nowMs: number,
  sampleSize: number = defaultViralityConfig.baselineSampleSize,
): ScorableTweet[] {
  const scale = 1 + (authorUsername.length % 5) * 0.1;
  const length = Math.max(1, Math.min(sampleSize, 8));

  return Array.from({ length }, (_unused, index) => {
    const ageHours = 12 * (index + 1);

    return {
      createdAt: new Date(nowMs - ageHours * millisecondsPerHour).toISOString(),
      metrics: {
        replies: Math.round(4 * scale),
        reposts: Math.round(6 * scale),
        quotes: Math.round(2 * scale),
        likes: Math.round(40 * scale),
        views: Math.round(3_000 * scale),
      },
    } satisfies ScorableTweet;
  });
}

/** The default sampler for local-dev: a deterministic fixture, no provider call. */
export const fixtureAuthorTweetSampler: AuthorTweetSampler = async (authorUsername) =>
  buildFixtureAuthorSample(authorUsername, Date.now());
