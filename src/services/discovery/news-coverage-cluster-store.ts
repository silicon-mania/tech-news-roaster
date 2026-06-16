import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "@/services/auth";
import { getOperatorSession } from "@/services/auth/operator-session";
import { type OperatorSessionReader, resolveOwnerId } from "@/services/saved-runs/run-repository";
import { createInMemoryNewsCoverageClusterRepository } from "./in-memory-news-coverage-cluster-repository";
import type { NewsCoverageClusterRepository } from "./news-coverage-cluster-repository";
import { createSupabaseNewsCoverageClusterRepository } from "./supabase-news-coverage-cluster-repository";

type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Builds an owner-scoped {@link NewsCoverageClusterRepository}. With Supabase
 * configured it is the Postgres store reached with the service-role key; otherwise
 * it is the in-memory fallback so local fixture development works without a
 * backend. Mirrors createAuthorBaselineRepository.
 */
export function createNewsCoverageClusterRepository(
  ownerId: string,
  env: SupabaseEnvironment = process.env,
): NewsCoverageClusterRepository {
  const config = readSupabaseConfig(env);

  if (!config) {
    return createInMemoryNewsCoverageClusterRepository(ownerId);
  }

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  return createSupabaseNewsCoverageClusterRepository(ownerId, client);
}

export type NewsCoverageClusterRepositoryResolution =
  | { repository: NewsCoverageClusterRepository }
  | { unauthorized: true };

/**
 * Resolves the Operator Account behind a request and hands back its cluster
 * repository, or rejects when Supabase is configured but no operator is signed in
 * — the same owner resolution the Saved Run and Author Baseline repositories use,
 * so a run, its authors' baselines, and its cluster all land under one owner.
 */
export async function resolveNewsCoverageClusterRepository(
  env: SupabaseEnvironment = process.env,
  getSession: OperatorSessionReader = getOperatorSession,
): Promise<NewsCoverageClusterRepositoryResolution> {
  const owner = await resolveOwnerId(env, getSession);

  if ("unauthorized" in owner) {
    return { unauthorized: true };
  }

  return { repository: createNewsCoverageClusterRepository(owner.ownerId, env) };
}
