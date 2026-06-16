/**
 * Documented defaults for News Coverage Clustering (issue 016). Like the virality
 * defaults these are deliberately permissive starting values, not tuned thresholds:
 * exact tuning — the similarity bar and the clustering window — is deferred to issue
 * 021 (see docs/adr/0020-automated-discovery-via-api-list-polling.md).
 */

export type ClusteringConfig = {
  /**
   * Minimum semantic similarity (0..1) between a tweet and a cluster's Source
   * Tweet for the tweet to join that cluster. Lower means more tweets collapse
   * into one News Coverage Cluster (fewer, broader clusters); higher splits the
   * same news into several. Tuned with the rest of the discovery numbers in 021.
   */
  similarityThreshold: number;
  /**
   * The clustering window: the maximum age difference (milliseconds) between a
   * cluster's Source Tweet — its earliest qualifying member — and a later tweet
   * that may still join it. It bounds a cluster's lifetime to one window from the
   * tweet that broke the news, so coverage that trickles in much later starts a
   * fresh event rather than re-opening an old one.
   */
  clusterWindowMs: number;
};

export const defaultClusteringConfig: ClusteringConfig = {
  similarityThreshold: 0.3,
  clusterWindowMs: 6 * 60 * 60 * 1000,
};
