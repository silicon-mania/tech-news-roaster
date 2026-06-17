import "server-only";

import { createClient } from "@supabase/supabase-js";
import {
  readOperatorAllowlistedEmail,
  readSupabaseConfig,
  type SupabaseConfig,
} from "@/services/auth";
import type { OperatorSession } from "@/services/auth/operator-session";

type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

/** Looks up the operator's auth user by email with the service-role admin API. */
export type OperatorUserLookup = (
  config: SupabaseConfig,
  email: string,
) => Promise<OperatorSession | null>;

/**
 * Resolves the single Operator Account **without a request session**, for the
 * unattended Discovery Sweep (issue 021). HTTP routes identify the operator from
 * the session cookie via `getOperatorSession`, but a Vercel Cron request carries no
 * cookie — only the `CRON_SECRET` bearer — so the one operator is identified by
 * `OPERATOR_ALLOWLISTED_EMAIL` and looked up with the service-role admin API.
 *
 * This is shaped as an {@link OperatorSessionReader} so it can be injected wherever
 * the session-based reader is the default (`resolveOwnerId`, `resolveRunRepository`,
 * `resolveImageBytesStore`), threading one headless owner through the whole sweep →
 * compose → persist chain. It is **never** the default for an HTTP route: treating
 * "no session" as "the operator" would defeat the auth gate.
 *
 * Returns `null` when Supabase is unconfigured (callers' `resolveOwnerId` then uses
 * its local-dev owner), when no email is allowlisted, or when no auth user matches
 * that email yet — the last meaning the operator has not signed in once to create
 * their account, so the sweep reports `unauthorized` rather than persisting unowned
 * work.
 */
export async function resolveHeadlessOperatorSession(
  env: SupabaseEnvironment = process.env,
  lookup: OperatorUserLookup = lookupOperatorByEmail,
): Promise<OperatorSession | null> {
  const config = readSupabaseConfig(env);

  if (!config) {
    return null;
  }

  const email = readOperatorAllowlistedEmail(env);

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

  // Single-operator tool: the allowlist guarantees at most one real user, so the
  // first admin page is enough to find them by email. `readOperatorAllowlistedEmail`
  // already lower-cases, so the match is case-insensitive.
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 200 });

  if (error || !data) {
    return null;
  }

  const match = data.users.find((user) => user.email?.trim().toLowerCase() === email);

  return match?.email ? { email: match.email, userId: match.id } : null;
}
