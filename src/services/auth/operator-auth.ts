import "server-only";

import { createSupabaseRouteHandlerClient } from "./supabase-server-client";

/**
 * The narrow auth surface the operator sign-in routes depend on. Defining it as
 * an interface lets the routes be driven by a fake in tests without a real
 * Supabase project, keeping the automated suite fast and deterministic.
 */
export type OperatorAuthClient = {
  requestCode: (email: string) => Promise<{ error: { message: string } | null }>;
  signOut: () => Promise<{ error: { message: string } | null }>;
  verifyCode: (input: {
    code: string;
    email: string;
  }) => Promise<{ error: { message: string } | null }>;
};

export type OperatorAuthClientFactory = (
  env: Readonly<Record<string, string | undefined>>,
) => Promise<OperatorAuthClient>;

export const createOperatorAuthClient: OperatorAuthClientFactory = async (env) => {
  const supabase = await createSupabaseRouteHandlerClient(env);

  return {
    // shouldCreateUser stays true so the very first sign-in by the allowlisted
    // email provisions the single Operator Account; the route-level allowlist
    // check guarantees no other email ever reaches this call.
    requestCode: (email) =>
      supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } }),
    signOut: () => supabase.auth.signOut(),
    verifyCode: ({ code, email }) => supabase.auth.verifyOtp({ email, token: code, type: "email" }),
  };
};
