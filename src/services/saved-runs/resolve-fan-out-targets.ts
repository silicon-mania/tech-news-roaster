import "server-only";

import { createClient } from "@supabase/supabase-js";
import { readOperatorAllowlist, readSupabaseConfig, type SupabaseConfig } from "@/services/auth";
import type { OperatorSession } from "@/services/auth/operator-session";

type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

export type FanOutTargetsResolution = {
  /**
   * Every allowlisted operator that already has an Operator Account — the runs a
   * Discovery Sweep composes under the Primary Operator are copied to each of these
   * (the anchor itself is filtered out at copy time, since it holds the original).
   * Ordered by the allowlist so the Primary Operator is first.
   */
  targets: OperatorSession[];
  /**
   * Allowlisted operators that have not signed in yet, so there is no account to copy
   * into. They are skipped (forward-only, no backfill) and logged by the sweep.
   */
  skipped: string[];
};

/** Looks up which allowlisted emails already have a provisioned account. Keyed by
 *  normalized (trim + lower-case) email so it matches the allowlist directly. */
export type AllowlistedOperatorLookup = (
  config: SupabaseConfig,
  allowlist: ReadonlySet<string>,
) => Promise<Map<string, OperatorSession>>;

/**
 * Resolves the fan-out targets for a Discovery Sweep: every **allowlisted operator
 * that already has an Operator Account** (ADR-0024). The sweep composes each
 * Automated Run once under the Primary Operator, then copies the finished run to
 * these targets; operators not yet provisioned have no account to copy into, so they
 * are returned as `skipped` for the sweep to log — forward-only, never backfilled.
 *
 * Returns empty (`targets` and `skipped` both `[]`) when Supabase is unconfigured
 * (local single-operator dev — there are no separate accounts to fan out to) or the
 * allowlist is empty. A lookup that errors degrades to "every allowlisted operator is
 * skipped" rather than throwing, so a transient admin-API failure costs that sweep its
 * copies but never the anchor's run.
 */
export async function resolveFanOutTargets(
  env: SupabaseEnvironment = process.env,
  lookup: AllowlistedOperatorLookup = lookupAllowlistedOperators,
): Promise<FanOutTargetsResolution> {
  const config = readSupabaseConfig(env);
  const allowlist = readOperatorAllowlist(env);

  if (!config || allowlist.size === 0) {
    return { targets: [], skipped: [] };
  }

  const accountsByEmail = await lookup(config, allowlist);
  const targets: OperatorSession[] = [];
  const skipped: string[] = [];

  // Iterate the allowlist (insertion-ordered Set) so targets stay in allowlist order.
  for (const email of allowlist) {
    const account = accountsByEmail.get(email);

    if (account) {
      targets.push(account);
    } else {
      skipped.push(email);
    }
  }

  return { targets, skipped };
}

async function lookupAllowlistedOperators(
  config: SupabaseConfig,
  allowlist: ReadonlySet<string>,
): Promise<Map<string, OperatorSession>> {
  const client = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  // Small-team tool: the allowlist holds a handful of operators, so the first admin
  // page covers every account — the same single-page lookup resolveHeadlessOperatorSession
  // uses to find the Primary Operator.
  const { data, error } = await client.auth.admin.listUsers({ page: 1, perPage: 200 });
  const accounts = new Map<string, OperatorSession>();

  if (error || !data) {
    return accounts;
  }

  for (const user of data.users) {
    const email = user.email?.trim().toLowerCase();

    if (email && allowlist.has(email) && !accounts.has(email)) {
      accounts.set(email, { email: user.email ?? email, userId: user.id });
    }
  }

  return accounts;
}
