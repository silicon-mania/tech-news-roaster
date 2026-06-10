import { describe, expect, test } from "vitest";
import {
  buildEnrichmentCompletedEvent,
  buildGenerationFailureEvent,
  parseGenerationStreamEvent,
  parseImageGenerationStreamEvent,
} from "@/services/generation";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import { buildImageSet } from "./test-fixtures";

describe("generation stream event contracts", () => {
  test("builds a short failed retrieval event", () => {
    expect(
      parseGenerationStreamEvent(
        buildGenerationFailureEvent("Source tweet could not be retrieved."),
      ),
    ).toEqual({
      type: "failed",
      message: "Source tweet could not be retrieved.",
    });
  });

  test("rejects unknown stream event shapes", () => {
    expect(() =>
      parseGenerationStreamEvent({
        type: "progress",
        label: "Drafts for 123",
        draftCount: 1,
        draftTarget: 3,
      }),
    ).toThrow();
  });

  test("validates enrichment-completed events without hidden enrichment text", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const event = buildEnrichmentCompletedEvent({
      sourceTweet: tweetContext.sourceTweet,
      newsLinkedImages: [
        {
          id: "news-linked-image-1",
          url: "https://example.com/news-linked-image.jpg",
          altText: "Product launch screenshot.",
          sourceUrl: "https://example.com/report",
          title: "Launch visual",
        },
      ],
    });

    expect(parseGenerationStreamEvent(event)).toEqual({
      type: "enrichment-completed",
      sourceTweet: tweetContext.sourceTweet,
      newsLinkedImages: [
        {
          id: "news-linked-image-1",
          url: "https://example.com/news-linked-image.jpg",
          altText: "Product launch screenshot.",
          sourceUrl: "https://example.com/report",
          title: "Launch visual",
        },
      ],
    });
    expect(JSON.stringify(event)).not.toContain("summary");
    expect(JSON.stringify(event)).not.toContain("retrievedAt");
  });

  test("validates image stream events, image sets, failed sets, and terminal state", () => {
    const imageSet = buildImageSet();
    const failedImageSet = {
      id: "failed-image-set-1",
      failedAt: "2026-06-05T10:22:00.000Z",
      message: "The image model rejected the selected original.",
      selectedImageId: "news-linked-image-2",
    };

    expect(
      parseImageGenerationStreamEvent({
        type: "image-set-completed",
        imageSet,
      }),
    ).toMatchObject({
      type: "image-set-completed",
      imageSet: {
        imageModelProvenance: {
          model: "image-model-v1",
          provider: "ai-gateway",
        },
      },
    });
    expect(
      parseImageGenerationStreamEvent({
        type: "image-set-failed",
        failedImageSet,
      }),
    ).toEqual({
      type: "image-set-failed",
      failedImageSet,
    });
    expect(
      parseImageGenerationStreamEvent({
        type: "image-generation-completed",
        state: {
          status: "partially-failed",
          completedAt: "2026-06-05T10:25:00.000Z",
          imageSets: [imageSet],
          failedImageSets: [failedImageSet],
        },
      }),
    ).toMatchObject({
      type: "image-generation-completed",
      state: {
        status: "partially-failed",
      },
    });
    expect(() =>
      parseImageGenerationStreamEvent({
        type: "image-generation-completed",
        state: {
          status: "completed",
          completedAt: "2026-06-05T10:25:00.000Z",
          imageSets: [imageSet],
          failedImageSets: [failedImageSet],
        },
      }),
    ).toThrow();
  });
});
