import type { RetrievedSourceTweet } from "@/services/tweet-retrieval";
import { type AuthorBaseline, computeAuthorBaseline, isBaselineStale } from "./author-baseline";
import type { AuthorBaselineRepository } from "./author-baseline-repository";
import {
  type AuthorRelativeViralityScore,
  scoreAuthorRelativeVirality,
} from "./author-relative-virality";
import type { AuthorTweetSampler } from "./author-tweet-sampler";
import { defaultViralityConfig, type ViralityConfig } from "./virality-config";
import type { ScorableTweet } from "./virality-scoring";

type ResolveAuthorBaselineInput = {
  authorUsername: string;
  repository: AuthorBaselineRepository;
  sampler: AuthorTweetSampler;
  nowMs?: number;
  config?: ViralityConfig;
};

/**
 * Returns an author's baseline, computing it lazily and persisting it when none
 * exists or the stored one is stale. Refresh is best-effort: if the sampler fails
 * but a (stale) baseline exists, the stale one is kept rather than dropping the
 * author — recall over precision.
 */
export async function resolveAuthorBaseline({
  authorUsername,
  repository,
  sampler,
  nowMs = Date.now(),
  config = defaultViralityConfig,
}: ResolveAuthorBaselineInput): Promise<AuthorBaseline> {
  const existing = await repository.get(authorUsername);

  if (existing && !isBaselineStale(existing, nowMs, config.baselineRefreshHours)) {
    return existing;
  }

  let sample: ScorableTweet[] = [];

  try {
    sample = await sampler(authorUsername);
  } catch {
    if (existing) {
      return existing;
    }
  }

  const baseline = computeAuthorBaseline(authorUsername, sample, { nowMs, config });

  await repository.save(baseline);

  return baseline;
}

export type TweetViralityQualification = AuthorRelativeViralityScore & {
  baseline: AuthorBaseline;
};

type QualifyTweetViralityInput = {
  tweet: RetrievedSourceTweet;
  repository: AuthorBaselineRepository;
  sampler: AuthorTweetSampler;
  nowMs?: number;
  config?: ViralityConfig;
};

/**
 * The end-to-end author-relative judgment for one discovered tweet: resolve (or
 * lazily compute and persist) its author's baseline, then score the tweet against
 * it. This is what the Discovery Sweep (issue 020) calls per surfaced tweet.
 */
export async function qualifyTweetVirality({
  tweet,
  repository,
  sampler,
  nowMs = Date.now(),
  config = defaultViralityConfig,
}: QualifyTweetViralityInput): Promise<TweetViralityQualification> {
  const baseline = await resolveAuthorBaseline({
    authorUsername: tweet.author.username,
    repository,
    sampler,
    nowMs,
    config,
  });
  const score = scoreAuthorRelativeVirality(tweet, baseline, { nowMs, config });

  return { ...score, baseline };
}
