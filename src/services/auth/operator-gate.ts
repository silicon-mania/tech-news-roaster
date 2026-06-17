/**
 * The pure decision behind the server-side session check. The middleware wires
 * Supabase and cookies around this; the rule itself is plain data-in/data-out
 * so the gating policy can be tested exhaustively without a request.
 *
 * Policy: deny by default. Everything is gated behind the Operator Account
 * except an explicit set of public paths (the sign-in surface, the auth API,
 * the bearer-authenticated /enrich service route, and the CRON_SECRET-authenticated
 * /api/discovery-sweep route). The last two are public to the *session* gate
 * because they authenticate themselves with a bearer token; without this the
 * session check would 401 an unattended Vercel Cron request before its own auth
 * runs. When Supabase is not configured the gate stays open, so local fixture
 * development and the test suite keep working without an auth backend.
 */
export type OperatorGateDecision =
  | { type: "allow" }
  | { type: "redirect"; location: string }
  | { type: "unauthorized" };

const signInPath = "/sign-in";

const publicPathPrefixes = [signInPath, "/api/auth", "/enrich", "/api/discovery-sweep"];

export function resolveOperatorGate({
  hasOperator,
  isConfigured,
  pathname,
}: {
  hasOperator: boolean;
  isConfigured: boolean;
  pathname: string;
}): OperatorGateDecision {
  if (!isConfigured || isPublicPath(pathname) || hasOperator) {
    return { type: "allow" };
  }

  if (pathname.startsWith("/api")) {
    return { type: "unauthorized" };
  }

  return { location: signInPath, type: "redirect" };
}

function isPublicPath(pathname: string): boolean {
  return publicPathPrefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}
