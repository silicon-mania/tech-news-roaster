import type { NewsCoverageCluster } from "./news-coverage-cluster";
import type { NewsCoverageClusterRepository } from "./news-coverage-cluster-repository";

type OwnerClusters = Map<string, NewsCoverageCluster>;

// Process-lifetime store shared across requests, backing local fixture development
// (no Supabase configured). Mirrors the in-memory Author Baseline store: clusters
// survive reloads for the server's life, while cross-device continuity needs Supabase.
const sharedClustersByOwner = new Map<string, OwnerClusters>();

/**
 * An owner-scoped {@link NewsCoverageClusterRepository} held entirely in memory.
 * Tests pass a fresh `clustersByOwner` map for isolation; the default shared map
 * serves the local-dev fallback.
 */
export function createInMemoryNewsCoverageClusterRepository(
  ownerId: string,
  clustersByOwner: Map<string, OwnerClusters> = sharedClustersByOwner,
): NewsCoverageClusterRepository {
  function ownerClusters(): OwnerClusters {
    const existing = clustersByOwner.get(ownerId);

    if (existing) {
      return existing;
    }

    const created: OwnerClusters = new Map();
    clustersByOwner.set(ownerId, created);

    return created;
  }

  return {
    async listRecent(sinceCreatedAt) {
      const sinceMs = Date.parse(sinceCreatedAt);

      return [...ownerClusters().values()]
        .filter((cluster) => Date.parse(cluster.earliestCreatedAt) >= sinceMs)
        .sort(
          (left, right) => Date.parse(left.earliestCreatedAt) - Date.parse(right.earliestCreatedAt),
        );
    },

    async loadById(clusterId) {
      return ownerClusters().get(clusterId) ?? null;
    },

    async save(cluster) {
      ownerClusters().set(cluster.id, cluster);
    },
  };
}
