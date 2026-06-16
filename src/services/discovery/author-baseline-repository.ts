import type { AuthorBaseline } from "./author-baseline";

/**
 * The persistence port for Author Baselines: fetch one author's baseline and upsert
 * a freshly computed one. Implementations are owner-scoped by construction (one
 * Operator Account), mirroring the Saved Run repository.
 */
export type AuthorBaselineRepository = {
  get(authorUsername: string): Promise<AuthorBaseline | null>;
  save(baseline: AuthorBaseline): Promise<void>;
};
