import type { NewsCoverageCluster } from "./news-coverage-cluster";

/**
 * The persistence port for News Coverage Clusters. `listRecent` returns the
 * clusters still inside the clustering window so a sweep can test whether a new
 * viral tweet joins one; `save` upserts a cluster (new, extended, or with its run
 * linked). Implementations are owner-scoped by construction (one Operator
 * Account), mirroring the Author Baseline and Saved Run repositories.
 */
export type NewsCoverageClusterRepository = {
  /** Clusters whose Source Tweet is no older than `sinceCreatedAt` (ISO-8601). */
  listRecent(sinceCreatedAt: string): Promise<NewsCoverageCluster[]>;
  loadById(clusterId: string): Promise<NewsCoverageCluster | null>;
  save(cluster: NewsCoverageCluster): Promise<void>;
};
