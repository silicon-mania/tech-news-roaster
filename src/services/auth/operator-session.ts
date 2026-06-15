import "server-only";

import type { User } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "./supabase-config";
import { createSupabaseRouteHandlerClient } from "./supabase-server-client";

export type OperatorSession = {
  email: string;
  userId: string;
};

/**
 * Reads the signed-in Operator Account from the request cookies, validating the
 * token against Supabase (`getUser`, not `getSession`). Returns null when no
 * operator is signed in or when Supabase is not configured.
 */
export async function getOperatorSession(
  env: Readonly<Record<string, string | undefined>> = process.env,
): Promise<OperatorSession | null> {
  if (!isSupabaseConfigured(env)) {
    return null;
  }

  const supabase = await createSupabaseRouteHandlerClient(env);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return toOperatorSession(user);
}

function toOperatorSession(user: User | null): OperatorSession | null {
  if (!user?.email) {
    return null;
  }

  return { email: user.email, userId: user.id };
}
