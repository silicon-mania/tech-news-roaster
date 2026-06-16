/**
 * A `TweetSimilarity` scores how likely two tweets are about the same news, as a
 * number in 0..1 (0 unrelated, 1 effectively identical). News Coverage Clustering
 * is pure and takes this as an injected dependency, so the real semantic measure
 * (embeddings or an LLM judge) can be swapped in during tuning (issue 021) without
 * touching the grouping logic.
 */
export type TweetSimilarity = (left: string, right: string) => number;

const tokenPattern = /[a-z0-9]+/g;
// Ultra-common words carry no topic signal, so they are dropped before comparison
// — otherwise two unrelated tweets share "the/and/to" and read as similar.
const stopWords = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
  "you",
  "your",
]);

function contentTokens(text: string): Set<string> {
  const tokens = text.toLowerCase().match(tokenPattern) ?? [];

  return new Set(tokens.filter((token) => token.length > 1 && !stopWords.has(token)));
}

/**
 * The default {@link TweetSimilarity}: the Jaccard overlap of each tweet's
 * content tokens (lowercased, stop-words and one-character tokens removed). It is
 * deterministic and dependency-free, so the clustering function is usable and
 * fully testable without a model. It is intentionally coarse — a recall-favoring
 * placeholder for the semantic measure tuned in issue 021, not the final bar.
 */
export const tokenSimilarity: TweetSimilarity = (left, right) => {
  const leftTokens = contentTokens(left);
  const rightTokens = contentTokens(right);

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersectionSize = 0;

  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersectionSize += 1;
    }
  }

  const unionSize = leftTokens.size + rightTokens.size - intersectionSize;

  return intersectionSize / unionSize;
};
