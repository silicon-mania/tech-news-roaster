type SupabaseEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * The server-only Supabase credentials. None of these carry the
 * `NEXT_PUBLIC_` prefix on purpose: per ADR-0019 the browser reaches Supabase
 * only through server routes, so service keys never reach the client bundle.
 */
export type SupabaseConfig = {
  anonKey: string;
  serviceRoleKey: string;
  url: string;
};

export function readSupabaseConfig(env: SupabaseEnvironment): SupabaseConfig | null {
  const url = readEnvValue(env.SUPABASE_URL);
  const anonKey = readEnvValue(env.SUPABASE_ANON_KEY);
  const serviceRoleKey = readEnvValue(env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !anonKey || !serviceRoleKey) {
    return null;
  }

  return { anonKey, serviceRoleKey, url };
}

export function isSupabaseConfigured(env: SupabaseEnvironment): boolean {
  return readSupabaseConfig(env) !== null;
}

function readEnvValue(value: string | undefined): string | undefined {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
}
