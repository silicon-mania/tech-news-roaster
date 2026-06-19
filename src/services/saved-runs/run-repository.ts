import "server-only";

import { createClient } from "@supabase/supabase-js";
import { isSupabaseConfigured, readSupabaseConfig } from "@/services/auth";
import { getOperatorSession } from "@/services/auth/operator-session";
import { createInMemoryRunRepository } from "./in-memory-run-repository";
import { createSupabaseRunRepository } from "./supabase-run-repository";
import type { RunRepository } from "./types";

type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

export type OperatorSessionReader = (
  env: SupabaseEnvironment,
) => Promise<{ userId: string } | null>;

// The owner the local-dev fallback persists under when Supabase is unconfigured.
// It mirrors the open gate in operator-gate: no auth backend, no real operator,
// so a single stable owner keeps fixture runs together for the server's life.
// Shared (via resolveOwnerId) with the image-bytes store so a run and its bytes
// land under one owner.
const localOperatorId = "local-operator";

/**
 * Builds an owner-scoped {@link RunRepository}. With Supabase configured it is
 * the Postgres-backed store reached with the service-role key; otherwise it is
 * the in-memory fallback so local fixture development works without an auth
 * backend. Exported so the Automated Run fan-out can build a repository for an
 * explicit target owner id (not just the session/headless operator).
 */
export function createRunRepository(
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

export type OwnerResolution = { ownerId: string } | { unauthorized: true };

/**
 * Resolves the Operator Account behind a request. When Supabase is unconfigured
 * the gate is open (matching operator-gate) and the local fallback owner is
 * used; otherwise it rejects unless an operator is signed in. Shared by the run
 * repository and the image-bytes store so both scope to the same owner.
 */
export async function resolveOwnerId(
  env: SupabaseEnvironment = process.env,
  getSession: OperatorSessionReader = getOperatorSession,
): Promise<OwnerResolution> {
  if (!isSupabaseConfigured(env)) {
    return { ownerId: localOperatorId };
  }

  const session = await getSession(env);

  if (!session) {
    return { unauthorized: true };
  }

  return { ownerId: session.userId };
}

export type RunRepositoryResolution = { repository: RunRepository } | { unauthorized: true };

/**
 * Resolves the Operator Account behind a request and hands back its repository,
 * or rejects when Supabase is configured but no operator is signed in.
 */
export async function resolveRunRepository(
  env: SupabaseEnvironment = process.env,
  getSession: OperatorSessionReader = getOperatorSession,
): Promise<RunRepositoryResolution> {
  const owner = await resolveOwnerId(env, getSession);

  if ("unauthorized" in owner) {
    return { unauthorized: true };
  }

  return { repository: createRunRepository(owner.ownerId, env) };
}
