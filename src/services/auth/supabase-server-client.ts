import "server-only";

import { type CookieOptions, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { readSupabaseConfig, type SupabaseConfig } from "./supabase-config";

/**
 * The cookie adapter `@supabase/ssr` needs to read and write the operator
 * session. Route handlers back it with `next/headers`; the middleware backs it
 * with the incoming request and outgoing response.
 */
export type ServerCookieAdapter = {
  getAll: () => { name: string; value: string }[];
  setAll: (cookies: { name: string; options?: CookieOptions; value: string }[]) => void;
};

class SupabaseNotConfiguredError extends Error {
  constructor() {
    super("Supabase is not configured.");
    this.name = "SupabaseNotConfiguredError";
  }
}

export function createSupabaseServerClient(
  config: SupabaseConfig,
  cookieAdapter: ServerCookieAdapter,
) {
  return createServerClient(config.url, config.anonKey, {
    cookies: cookieAdapter,
  });
}

/**
 * Builds a Supabase client bound to the request's cookies for use inside a
 * route handler (or a server component, where cookie writes are swallowed).
 * Throws when Supabase is unconfigured so callers can surface a clean error.
 */
export async function createSupabaseRouteHandlerClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
) {
  const config = readSupabaseConfig(env);

  if (!config) {
    throw new SupabaseNotConfiguredError();
  }

  const cookieStore = await cookies();

  return createSupabaseServerClient(config, {
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      try {
        for (const { name, options, value } of cookiesToSet) {
          cookieStore.set(name, value, options);
        }
      } catch {
        // Server components cannot mutate cookies; the middleware refreshes the
        // session instead, so swallowing the write here is safe.
      }
    },
  });
}
