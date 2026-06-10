import { describe, expect, test, vi } from "vitest";
import { buildReplySignals } from "@/features/enrichment/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import {
  discoverNewsLinkedImages,
  NewsLinkedImageDiscoveryUnavailableError,
} from "./news-linked-image-discovery";

describe("news-linked image discovery", () => {
  test("returns one to five news-linked images with stable run-local IDs", async () => {
    const previousEndpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;
    const previousApiKey = process.env.OUTSIDE_X_ENRICHMENT_API_KEY;
    const previousFetch = globalThis.fetch;
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const requestBodies: unknown[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBodies.push(JSON.parse(String(init?.body)));

      return Response.json({
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
      });
    });

    process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT = "https://outside-x.example/enrich";
    process.env.OUTSIDE_X_ENRICHMENT_API_KEY = "outside-x-secret";
    globalThis.fetch = fetcher;

    try {
      const discoveryResult = await discoverNewsLinkedImages({
        sourceTweet: tweetContext.sourceTweet,
        replySignals: buildReplySignals(tweetContext),
      });

      expect(discoveryResult).toEqual({
        discoveredAt: "2026-06-05T10:20:00.000Z",
        newsLinkedImages: [
          {
            id: "news-linked-image-1",
            url: "https://example.com/image-a.jpg",
            altText: "First visual candidate.",
            sourceUrl: "https://example.com/report",
            title: "First product image",
          },
          {
            id: "news-linked-image-2",
            url: "https://example.com/image-b.jpg",
            altText: "Second visual candidate.",
            sourceUrl: "https://example.com/report",
            title: "Second product image",
          },
        ],
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(requestBodies).toEqual([
        {
          sourceTweet: tweetContext.sourceTweet,
          replySignals: buildReplySignals(tweetContext),
          usersDirection: "",
        },
      ]);
    } finally {
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_ENDPOINT", previousEndpoint);
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_API_KEY", previousApiKey);
      globalThis.fetch = previousFetch;
    }
  });

  test("surfaces a discovery-specific unavailable error when the endpoint is unset", async () => {
    const previousEndpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    delete process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;

    try {
      await expect(
        discoverNewsLinkedImages({
          sourceTweet: tweetContext.sourceTweet,
          replySignals: buildReplySignals(tweetContext),
        }),
      ).rejects.toBeInstanceOf(NewsLinkedImageDiscoveryUnavailableError);
    } finally {
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_ENDPOINT", previousEndpoint);
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
