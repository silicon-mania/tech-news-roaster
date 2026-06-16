import { describe, expect, test, vi } from "vitest";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import {
  buildReplySignals,
  OutsideXEnrichmentUnavailableError,
  retrieveOutsideXEnrichment,
} from "./outside-x-enrichment";

describe("outside-X enrichment", () => {
  test("normalizes hidden context and news-linked images with stable run-local IDs", async () => {
    const previousEndpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;
    const previousApiKey = process.env.OUTSIDE_X_ENRICHMENT_API_KEY;
    const previousFetch = globalThis.fetch;
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const fetcher = vi.fn(async () =>
      Response.json({
        retrievedAt: "2026-06-05T10:20:00.000Z",
        items: [
          {
            title: "Outside report",
            summary: "The launch is tied to a broader platform shift.",
            url: "https://example.com/report",
          },
        ],
        newsLinkedImages: [
          {
            id: "provider-image-a",
            url: "https://example.com/image-a.jpg",
            altText: "First visual candidate.",
            sourceUrl: "https://example.com/report",
            title: "First product image",
          },
          {
            id: "provider-image-b",
            url: "https://example.com/image-b.jpg",
            altText: "Second visual candidate.",
            sourceUrl: "https://example.com/report",
            title: "Second product image",
          },
        ],
      }),
    );

    process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT = "https://outside-x.example/enrich";
    process.env.OUTSIDE_X_ENRICHMENT_API_KEY = "outside-x-secret";
    globalThis.fetch = fetcher;

    try {
      const enrichmentContext = await retrieveOutsideXEnrichment({
        sourceTweet: tweetContext.sourceTweet,
        replySignals: buildReplySignals(tweetContext),
        usersDirection: "Make it spiky.",
      });

      expect(fetcher).toHaveBeenCalledWith(
        "https://outside-x.example/enrich",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer outside-x-secret",
          }),
          method: "POST",
        }),
      );
      expect(enrichmentContext.items).toEqual([
        {
          title: "Outside report",
          summary: "The launch is tied to a broader platform shift.",
          url: "https://example.com/report",
        },
      ]);
      expect(enrichmentContext.newsLinkedImages.map((image) => image.id)).toEqual([
        "news-linked-image-1",
        "news-linked-image-2",
      ]);
      expect(enrichmentContext.newsLinkedImages[0]).toMatchObject({
        url: "https://example.com/image-a.jpg",
        sourceUrl: "https://example.com/report",
      });
    } finally {
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_ENDPOINT", previousEndpoint);
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_API_KEY", previousApiKey);
      globalThis.fetch = previousFetch;
    }
  });

  test("does not build placeholder images when the endpoint is unset", async () => {
    const previousEndpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    delete process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;

    try {
      await expect(
        retrieveOutsideXEnrichment({
          sourceTweet: tweetContext.sourceTweet,
          replySignals: buildReplySignals(tweetContext),
          usersDirection: "",
        }),
      ).rejects.toBeInstanceOf(OutsideXEnrichmentUnavailableError);
    } finally {
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_ENDPOINT", previousEndpoint);
    }
  });

  test("fails fast when the enrichment request exceeds the configured timeout", async () => {
    const previousEndpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;
    const previousApiKey = process.env.OUTSIDE_X_ENRICHMENT_API_KEY;
    const previousTimeout = process.env.OUTSIDE_X_ENRICHMENT_TIMEOUT_MS;
    const previousFetch = globalThis.fetch;
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    // Never resolves on its own; only the hard timeout can end the call. A
    // timed-out request degrades News-Linked Image Discovery like any failure.
    const fetcher = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject((init.signal as AbortSignal).reason),
          );
        }),
    );

    process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT = "https://outside-x.example/enrich";
    process.env.OUTSIDE_X_ENRICHMENT_API_KEY = "outside-x-secret";
    process.env.OUTSIDE_X_ENRICHMENT_TIMEOUT_MS = "50";
    globalThis.fetch = fetcher;

    try {
      await expect(
        retrieveOutsideXEnrichment({
          sourceTweet: tweetContext.sourceTweet,
          replySignals: buildReplySignals(tweetContext),
          usersDirection: "",
        }),
      ).rejects.toThrow(/timed out after \d+s waiting for the enrichment endpoint/);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_ENDPOINT", previousEndpoint);
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_API_KEY", previousApiKey);
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_TIMEOUT_MS", previousTimeout);
      globalThis.fetch = previousFetch;
    }
  });

  test("requires a bearer token when the endpoint is configured", async () => {
    const previousEndpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;
    const previousApiKey = process.env.OUTSIDE_X_ENRICHMENT_API_KEY;
    const previousFetch = globalThis.fetch;
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const fetcher = vi.fn();

    process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT = "https://outside-x.example/enrich";
    delete process.env.OUTSIDE_X_ENRICHMENT_API_KEY;
    globalThis.fetch = fetcher;

    try {
      await expect(
        retrieveOutsideXEnrichment({
          sourceTweet: tweetContext.sourceTweet,
          replySignals: buildReplySignals(tweetContext),
          usersDirection: "",
        }),
      ).rejects.toThrow("Outside-X enrichment API key is not configured.");
      expect(fetcher).not.toHaveBeenCalled();
    } finally {
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_ENDPOINT", previousEndpoint);
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_API_KEY", previousApiKey);
      globalThis.fetch = previousFetch;
    }
  });
});

function restoreEnvValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
