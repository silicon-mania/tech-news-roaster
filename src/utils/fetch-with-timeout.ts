// Shared hard-timeout wrapper around `fetch` for every external request on the
// Manual Run critical path — tweet retrieval, the three Text Generation provider
// calls plus the Provider Fallback call, and News-Linked Image Discovery —
// plus the Image Generation request that first proved the pattern.
//
// Without it a hung upstream stalls on the HTTP runtime's default header timeout
// (undici's `UND_ERR_HEADERS_TIMEOUT`, ~300s) and the caller only sees a bare
// "fetch failed" once the connection finally drops — turning one slow provider
// into a multi-minute run. A hard `AbortSignal`-based deadline fails fast and
// raises a clear, debuggable error naming the upstream and the elapsed seconds.

type FetchWithTimeoutInit = RequestInit & {
  /** Hard deadline in milliseconds; the request aborts once it elapses. */
  timeoutMs: number;
  /** Leads the timeout message, e.g. "Image generation" or "Tweet retrieval". */
  operationLabel: string;
  /** Closes the timeout message, e.g. "the AI Gateway" or "twitterapi.io". */
  upstreamLabel: string;
  /**
   * Fetch implementation to call; defaults to the global `fetch`. Injectable so
   * adapters that thread a custom fetcher (and their tests) keep working.
   */
  fetchImpl?: typeof fetch;
};

export async function fetchWithTimeout(
  url: Parameters<typeof fetch>[0],
  {
    timeoutMs,
    operationLabel,
    upstreamLabel,
    fetchImpl = fetch,
    signal,
    ...init
  }: FetchWithTimeoutInit,
): Promise<Response> {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;

  try {
    return await fetchImpl(url, { ...init, signal: requestSignal });
  } catch (error) {
    if (timeoutSignal.aborted && isAbortError(error)) {
      throw new Error(
        `${operationLabel} timed out after ${Math.round(
          timeoutMs / 1000,
        )}s waiting for ${upstreamLabel}.`,
        { cause: error },
      );
    }

    throw error;
  }
}

/**
 * Parse a positive-integer millisecond timeout from a raw env value, falling
 * back to `fallbackMs` for anything missing, non-numeric, or non-positive.
 */
export function readTimeoutMs(rawValue: string | undefined, fallbackMs: number): number {
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackMs;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}
