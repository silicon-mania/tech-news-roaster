import { describe, expect, test, vi } from "vitest";
import { buildFixtureTweetContext } from "@/features/tweet-retrieval/tweet-retrieval";
import {
  buildReplySignals,
  retrieveOutsideXEnrichment,
} from "./outside-x-enrichment";

describe("outside-X enrichment", () => {
  test("normalizes hidden context and news-linked images with stable run-local IDs", async () => {
    const previousEndpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;
    const previousFetch = globalThis.fetch;
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/2468",
    );
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

    process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT =
      "https://outside-x.example/enrich";
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
      expect(
        enrichmentContext.newsLinkedImages.map((image) => image.id),
      ).toEqual(["news-linked-image-1", "news-linked-image-2"]);
      expect(enrichmentContext.newsLinkedImages[0]).toMatchObject({
        url: "https://example.com/image-a.jpg",
        sourceUrl: "https://example.com/report",
      });
    } finally {
      restoreEnvValue("OUTSIDE_X_ENRICHMENT_ENDPOINT", previousEndpoint);
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
