// Shared error-introspection helpers for the Quiet Failure Details surface. A
// thrown `TypeError: fetch failed` (server) or `TypeError: Failed to fetch`
// (browser) hides the real reason in its `cause` chain — e.g. undici's
// `UND_ERR_HEADERS_TIMEOUT` when the AI Gateway never sends response headers in
// time. These helpers pull that chain (name, message, and `code`) into flat,
// human-readable lines so a failure surfaces what actually went wrong instead of
// a bare top-line message.

const maxCauseDepth = 5;

/**
 * A flat debug log for a thrown error: its name/message plus each nested `cause`,
 * with any `code` (e.g. `UND_ERR_HEADERS_TIMEOUT`) appended. Safe on any value.
 */
export function describeErrorDetail(error: unknown): string[] {
  const lines: string[] = [];
  let current: unknown = error;

  for (let depth = 0; current != null && depth < maxCauseDepth; depth += 1) {
    if (current instanceof Error) {
      const label = depth === 0 ? "Error" : "Cause";
      const code = readErrorCode(current);

      lines.push(`${label}: ${current.name}: ${current.message}${code ? ` (${code})` : ""}`);
      current = (current as { cause?: unknown }).cause;
    } else {
      lines.push(`${depth === 0 ? "Error" : "Cause"}: ${String(current)}`);
      break;
    }
  }

  return lines;
}

/**
 * A one-line message for an error, reaching into its first `cause` for a `code`
 * when the top-level error carries none — so "fetch failed" becomes
 * "fetch failed (UND_ERR_HEADERS_TIMEOUT)". Falls back to `fallback` for
 * non-errors or empty messages.
 */
export function summarizeErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    const code = readErrorCode(error) ?? readCauseCode(error);

    return code ? `${error.message} (${code})` : error.message;
  }

  return fallback;
}

function readCauseCode(error: Error): string | undefined {
  const cause = (error as { cause?: unknown }).cause;

  return cause instanceof Error ? readErrorCode(cause) : undefined;
}

function readErrorCode(error: Error): string | undefined {
  const code = (error as { code?: unknown }).code;

  return typeof code === "string" && code.trim() ? code : undefined;
}
