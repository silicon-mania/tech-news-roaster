import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "@/services/auth";
import { getOperatorSession } from "@/services/auth/operator-session";
import { type OperatorSessionReader, resolveOwnerId } from "@/services/saved-runs/run-repository";
import { createInMemorySeenTweetRepository } from "./in-memory-seen-tweet-repository";
import type { SeenTweetRepository } from "./seen-tweet-repository";
import { createSupabaseSeenTweetRepository } from "./supabase-seen-tweet-repository";

type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * Builds an owner-scoped {@link SeenTweetRepository}. With Supabase configured it
 * is the Postgres store reached with the service-role key; otherwise it is the
 * in-memory fallback so local fixture development works without a backend. Mirrors
 * createAuthorBaselineRepository.
 */
export function createSeenTweetRepository(
  ownerId: string,
  env: SupabaseEnvironment = process.env,
): SeenTweetRepository {
  const config = readSupabaseConfig(env);

  if (!config) {
    return createInMemorySeenTweetRepository(ownerId);
  }

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  return createSupabaseSeenTweetRepository(ownerId, client);
}

export type SeenTweetRepositoryResolution =
  | { repository: SeenTweetRepository }
  | { unauthorized: true };

/**
 * Resolves the Operator Account behind a request and hands back its seen-tweet
 * record, or rejects when Supabase is configured but no operator is signed in —
 * the same owner resolution the Saved Run and Author Baseline repositories use, so
 * a sweep's runs and its dedup record land under one owner.
 */
export async function resolveSeenTweetRepository(
  env: SupabaseEnvironment = process.env,
  getSession: OperatorSessionReader = getOperatorSession,
): Promise<SeenTweetRepositoryResolution> {
  const owner = await resolveOwnerId(env, getSession);

  if ("unauthorized" in owner) {
    return { unauthorized: true };
  }

  return { repository: createSeenTweetRepository(owner.ownerId, env) };
}
