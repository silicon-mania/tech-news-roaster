type OperatorAllowlistEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * The single email allowed to sign in as the Operator Account. Signup is
 * restricted to this one address (ADR-0019) so no random visitor can claim the
 * tool. Returns null when unconfigured, in which case nobody is allowed.
 */
export function readOperatorAllowlistedEmail(env: OperatorAllowlistEnvironment): string | null {
  const allowlistedEmail = env.OPERATOR_ALLOWLISTED_EMAIL?.trim();

  return allowlistedEmail ? normalizeEmail(allowlistedEmail) : null;
}

export function isAllowlistedOperatorEmail(
  email: string,
  env: OperatorAllowlistEnvironment,
): boolean {
  const allowlistedEmail = readOperatorAllowlistedEmail(env);

  if (!allowlistedEmail) {
    return false;
  }

  return normalizeEmail(email) === allowlistedEmail;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
