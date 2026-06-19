import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readPrimaryOperatorEmail, readSupabaseConfig, type SupabaseConfig } from "@/services/auth";
import type { OperatorSession } from "@/services/auth/operator-session";

type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

/** Looks up the operator's auth user by email with the service-role admin API. */
export type OperatorUserLookup = (
  config: SupabaseConfig,
  email: string,
) => Promise<OperatorSession | null>;

/**
 * Resolves the **Primary Operator**'s account **without a request session**, for the
 * unattended Discovery Sweep (issue 021). HTTP routes identify the operator from the
 * session cookie via `getOperatorSession`, but a Vercel Cron request carries no cookie —
 * only the `CRON_SECRET` bearer — so the Primary Operator (the first entry of
 * `OPERATOR_ALLOWLISTED_EMAILS`) is looked up with the service-role admin API. The
 * sweep anchors its dedup state and the single expensive composition under this one
 * account before fanning finished runs out to the other operators (ADR-0024).
 *
 * This is shaped as an {@link OperatorSessionReader} so it can be injected wherever
 * the session-based reader is the default (`resolveOwnerId`, `resolveRunRepository`,
 * `resolveImageBytesStore`), threading the Primary Operator through the whole sweep →
 * compose → persist chain. It is **never** the default for an HTTP route: treating
 * "no session" as "the operator" would defeat the auth gate.
 *
 * Returns `null` when Supabase is unconfigured (callers' `resolveOwnerId` then uses
 * its local-dev owner), when the allowlist is empty, or when no auth user matches the
 * Primary Operator email yet — the last meaning that operator has not signed in once to
 * create their account, so the sweep reports `unauthorized` rather than persisting
 * unowned work.
 */
export async function resolveHeadlessOperatorSession(
  env: SupabaseEnvironment = process.env,
  lookup: OperatorUserLookup = lookupOperatorByEmail,
): Promise<OperatorSession | null> {
  const config = readSupabaseConfig(env);

  if (!config) {
    return null;
  }

  const email = readPrimaryOperatorEmail(env);

  if (!email) {
    return null;
  }

  return lookup(config, email);
}

async function lookupOperatorByEmail(
  config: SupabaseConfig,
  email: string,
): Promise<OperatorSession | null> {
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Small-team tool: the allowlist holds a handful of operators, so the first admin
  // page covers them all and is enough to find the Primary Operator by email.
  // `readPrimaryOperatorEmail` already lower-cases, so the match is case-insensitive.
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 200 });

  if (error || !data) {
    return null;
  }

  const match = data.users.find((user) => user.email?.trim().toLowerCase() === email);

  return match?.email ? { email: match.email, userId: match.id } : null;
}
