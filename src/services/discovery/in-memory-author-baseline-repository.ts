import type { AuthorBaseline } from "./author-baseline";
import type { AuthorBaselineRepository } from "./author-baseline-repository";

type OwnerBaselines = Map<string, AuthorBaseline>;

// Process-lifetime store shared across requests, backing local fixture development
// (no Supabase configured). Mirrors the in-memory Saved Run store: baselines survive
// reloads for the server's life, while cross-device continuity needs Supabase.
const sharedBaselinesByOwner = new Map<string, OwnerBaselines>();

/**
 * An owner-scoped {@link AuthorBaselineRepository} held entirely in memory. Tests
 * pass a fresh `baselinesByOwner` map for isolation; the default shared map serves
 * the local-dev fallback.
 */
export function createInMemoryAuthorBaselineRepository(
  ownerId: string,
  baselinesByOwner: Map<string, OwnerBaselines> = sharedBaselinesByOwner,
): AuthorBaselineRepository {
  function ownerBaselines(): OwnerBaselines {
    const existing = baselinesByOwner.get(ownerId);

    if (existing) {
      return existing;
    }

    const created: OwnerBaselines = new Map();
    baselinesByOwner.set(ownerId, created);

    return created;
  }

  return {
    async get(authorUsername) {
      return ownerBaselines().get(authorUsername) ?? null;
    },

    async save(baseline) {
      ownerBaselines().set(baseline.authorUsername, baseline);
    },
  };
}
