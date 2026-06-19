type OperatorAllowlistEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * The Operator Allowlist: the normalized set of emails allowed to sign in as an
 * Operator Account, parsed from the comma-separated `OPERATOR_ALLOWLISTED_EMAILS`.
 * Each entry is trimmed + lower-cased and de-duplicated; an empty/unset value yields
 * an empty set, in which case nobody is allowed.
 *
 * Membership — not equality against one address — decides allowlisting (ADR-0024), so
 * several independent teammates can each sign in with the email-OTP flow and provision
 * their own Operator Account. The first entry is load-bearing — see
 * {@link readPrimaryOperatorEmail}.
 */
export function readOperatorAllowlist(env: OperatorAllowlistEnvironment): ReadonlySet<string> {
  return new Set(parseAllowlistedEmails(env));
}

/**
 * The Primary Operator: the first address in the Operator Allowlist. The unattended
 * Discovery Sweep anchors its dedup state and the single expensive composition under
 * this account (ADR-0024), so the first entry is **load-bearing** — reordering or
 * removing it re-anchors discovery under empty seen-tweet/cluster/baseline state and can
 * start duplicate runs. Returns null when the allowlist is empty.
 */
export function readPrimaryOperatorEmail(env: OperatorAllowlistEnvironment): string | null {
  return parseAllowlistedEmails(env)[0] ?? null;
}

/** Whether `email` is in the Operator Allowlist (case- and whitespace-insensitive). */
export function isAllowlistedOperatorEmail(
  email: string,
  env: OperatorAllowlistEnvironment,
): boolean {
  return readOperatorAllowlist(env).has(normalizeEmail(email));
}

/**
 * Parse `OPERATOR_ALLOWLISTED_EMAILS` into an ordered, normalized, de-duplicated list.
 * Order is preserved so the first entry is the Primary Operator; blank entries are
 * dropped and duplicates (after normalization) collapse to their first occurrence.
 */
function parseAllowlistedEmails(env: OperatorAllowlistEnvironment): string[] {
  const raw = env.OPERATOR_ALLOWLISTED_EMAILS;

  if (!raw) {
    return [];
  }

  const seen = new Set<string>();
  const emails: string[] = [];

  for (const entry of raw.split(",")) {
    const normalized = normalizeEmail(entry);

    if (normalized.length === 0 || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    emails.push(normalized);
  }

  return emails;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
