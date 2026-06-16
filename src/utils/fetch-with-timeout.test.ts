import { describe, expect, test, vi } from "vitest";
import { fetchWithTimeout, readTimeoutMs } from "./fetch-with-timeout";

// A fetch implementation that never resolves on its own; it only rejects once the
// request signal aborts (mirroring a real upstream that goes silent), so the hard
// timeout is the only thing that can end the call.
function hangingFetch() {
  return vi.fn((_url: Parameters<typeof fetch>[0], init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject((init.signal as AbortSignal).reason);
      });
    });
  });
}

describe("fetchWithTimeout", () => {
  test("passes the response through and attaches an abort signal when the upstream responds", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));

    const response = await fetchWithTimeout("https://example.com/resource", {
      fetchImpl,
      method: "POST",
      operationLabel: "Tweet retrieval",
      timeoutMs: 1_000,
      upstreamLabel: "twitterapi.io",
    });

    expect(await response.json()).toEqual({ ok: true });
    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.method).toBe("POST");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    // The label fields are consumed by the helper, never forwarded to fetch.
    expect(init).not.toHaveProperty("operationLabel");
    expect(init).not.toHaveProperty("timeoutMs");
  });

  test("rejects a never-resolving upstream within the configured timeout, naming the upstream and elapsed seconds", async () => {
    const fetchImpl = hangingFetch();

    await expect(
      fetchWithTimeout("https://example.com/resource", {
        fetchImpl,
        operationLabel: "Image generation",
        timeoutMs: 50,
        upstreamLabel: "the AI Gateway",
      }),
    ).rejects.toThrow(/^Image generation timed out after \d+s waiting for the AI Gateway\.$/);
  });

  test("preserves the abort error as the cause of the timeout error", async () => {
    const fetchImpl = hangingFetch();

    const error = await fetchWithTimeout("https://example.com/resource", {
      fetchImpl,
      operationLabel: "Visual joke generation",
      timeoutMs: 50,
      upstreamLabel: "the AI Gateway",
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(((error as Error).cause as Error).name).toBe("TimeoutError");
  });

  test("rethrows non-abort errors untouched", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    await expect(
      fetchWithTimeout("https://example.com/resource", {
        fetchImpl,
        operationLabel: "Outside-X enrichment",
        timeoutMs: 1_000,
        upstreamLabel: "the enrichment endpoint",
      }),
    ).rejects.toThrow("fetch failed");
  });
});

describe("readTimeoutMs", () => {
  test("parses a positive integer millisecond value", () => {
    expect(readTimeoutMs("4500", 1_000)).toBe(4500);
    expect(readTimeoutMs(" 4500 ", 1_000)).toBe(4500);
  });

  test("falls back for missing, non-numeric, or non-positive values", () => {
    expect(readTimeoutMs(undefined, 1_000)).toBe(1_000);
    expect(readTimeoutMs("", 1_000)).toBe(1_000);
    expect(readTimeoutMs("not-a-number", 1_000)).toBe(1_000);
    expect(readTimeoutMs("0", 1_000)).toBe(1_000);
    expect(readTimeoutMs("-200", 1_000)).toBe(1_000);
  });
});
