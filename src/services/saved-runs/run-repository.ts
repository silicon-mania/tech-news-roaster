import "server-only";

import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, readSupabaseConfig } from "@/services/auth";
import { getOperatorSession } from "@/services/auth/operator-session";
import { createInMemoryRunRepository } from "./in-memory-run-repository";
import { createSupabaseRunRepository } from "./supabase-run-repository";
import type { RunRepository } from "./types";

type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

type OperatorSessionReader = (env: SupabaseEnvironment) => Promise<{ userId: string } | null>;

// The owner the local-dev fallback persists under when Supabase is unconfigured.
// It mirrors the open gate in operator-gate: no auth backend, no real operator,
// so a single stable owner keeps fixture runs together for the server's life.
const localOperatorId = "local-operator";

/**
 * Builds an owner-scoped {@link RunRepository}. With Supabase configured it is
 * the Postgres-backed store reached with the service-role key; otherwise it is
 * the in-memory fallback so local fixture development works without an auth
 * backend.
 */
function createRunRepository(
  ownerId: string,
  env: SupabaseEnvironment = process.env,
): RunRepository {
  const config = readSupabaseConfig(env);

  if (!config) {
    return createInMemoryRunRepository(ownerId);
  }

  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  return createSupabaseRunRepository(ownerId, client);
}

export type RunRepositoryResolution = { repository: RunRepository } | { unauthorized: true };

/**
 * Resolves the Operator Account behind a request and hands back its repository,
 * or rejects when Supabase is configured but no operator is signed in. When
 * Supabase is unconfigured the gate is open (matching operator-gate) and the
 * local fallback owner is used.
 */
export async function resolveRunRepository(
  env: SupabaseEnvironment = process.env,
  getSession: OperatorSessionReader = getOperatorSession,
): Promise<RunRepositoryResolution> {
  if (!isSupabaseConfigured(env)) {
    return { repository: createRunRepository(localOperatorId, env) };
  }

  const session = await getSession(env);

  if (!session) {
    return { unauthorized: true };
  }

  return { repository: createRunRepository(session.userId, env) };
}
