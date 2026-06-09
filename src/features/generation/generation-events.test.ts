import { describe, expect, test } from "vitest";
import { buildReplySignals } from "@/features/enrichment/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/features/tweet-retrieval/tweet-retrieval";
import {
  buildEnrichmentCompletedEvent,
  buildGenerationFailureEvent,
  buildStubbedGenerationEvents,
  parseCompletedGenerationRunPayload,
  parseGenerationStreamEvent,
  parseImageGenerationInput,
  parseImageGenerationStreamEvent,
  parseSavedGenerationRun,
} from "./generation-events";

describe("generation event contracts", () => {
  test("builds deterministic progress events followed by a completed run", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const events = buildStubbedGenerationEvents({
      replySignals: buildReplySignals(tweetContext),
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "Keep it skeptical.",
    });

    expect(events.map((event) => event.type)).toEqual([
      "progress",
      "progress",
      "progress",
      "completed",
    ]);
    expect(events[0]).toMatchObject({
      type: "progress",
      label: "Drafts for 2468",
      draftCount: 1,
      draftTarget: 3,
      sourceTweet: expect.objectContaining({
        text: expect.stringContaining("agent workspace"),
      }),
    });
    expect(events[3]).toMatchObject({
      type: "completed",
      run: {
        label: "Drafts for 2468",
        sourceTweet: expect.objectContaining({
          text: expect.stringContaining("agent workspace"),
        }),
        drafts: expect.arrayContaining([
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "openai",
            visibleRationale: expect.stringContaining("platform leverage"),
          }),
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "anthropic",
          }),
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "google",
          }),
        ]),
      },
    });
  });

  test("rejects completed runs without exactly three drafts", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    expect(() =>
      parseCompletedGenerationRunPayload({
        label: "Incomplete run",
        sourceTweet: tweetContext.sourceTweet,
        drafts: [
          {
            angle: "incomplete",
            id: "one",
            text: "Quote-tweet draft: One draft is not a completed comparison.",
            modelProvenance: "local draft model",
            provider: "openai",
            visibleRationale: "This should still fail because it is alone.",
          },
        ],
      }),
    ).toThrow();
  });

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

  test("validates image-generation input and rejects raw URL submission", () => {
    expect(
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
        userImagePrompt: "Make the product visual punchier.",
      }),
    ).toEqual({
      parentRunId: "run-1",
      selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
      userImagePrompt: "Make the product visual punchier.",
    });
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["https://example.com/image.jpg"],
        userImagePrompt: "Use this URL.",
      }),
    ).toThrow();
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["news-linked-image-1", "news-linked-image-2", "news-linked-image-3"],
        userImagePrompt: "Too many images.",
      }),
    ).toThrow();
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["news-linked-image-1"],
        userImagePrompt: " ",
      }),
    ).toThrow();
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["news-linked-image-1"],
        imageUrls: ["https://example.com/image.jpg"],
        userImagePrompt: "Reject unknown raw URL fields.",
      }),
    ).toThrow();
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

  test("validates v2 saved runs and rejects invalid one-time image states", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const imageSet = buildImageSet();

    expect(
      parseSavedGenerationRun({
        id: "run-1",
        label: "Drafts for 2468",
        sourceTweetUrl: "https://x.com/siliconmania/status/2468",
        usersDirection: "Keep it skeptical.",
        status: "completed",
        phase: "image-generation-complete",
        draftCount: 3,
        draftTarget: 3,
        sourceTweet: tweetContext.sourceTweet,
        savedAt: "2026-06-05T10:30:00.000Z",
        drafts: buildStubbedGenerationEvents({
          replySignals: buildReplySignals(tweetContext),
          sourceTweet: tweetContext.sourceTweet,
          sourceTweetUrl: "https://x.com/siliconmania/status/2468",
          usersDirection: "Keep it skeptical.",
        }).flatMap((event) => (event.type === "progress" ? [event.draft] : [])),
        imageGenerationState: {
          status: "completed",
          selectedImageIds: ["news-linked-image-1"],
          userImagePrompt: "Make it brighter.",
          startedAt: "2026-06-05T10:20:00.000Z",
          completedAt: "2026-06-05T10:25:00.000Z",
        },
        imageModelProvenance: {
          model: "image-model-v1",
          provider: "ai-gateway",
        },
        imageSets: [imageSet],
        selectedImageOriginals: [imageSet.selectedImageOriginal],
      }),
    ).toMatchObject({
      id: "run-1",
      imageGenerationState: {
        status: "completed",
      },
    });
    expect(() =>
      parseSavedGenerationRun({
        id: "run-1",
        label: "Drafts for 2468",
        sourceTweetUrl: "https://x.com/siliconmania/status/2468",
        usersDirection: "",
        status: "completed",
        draftCount: 3,
        draftTarget: 3,
        drafts: [],
        imageGenerationState: {
          status: "retryable",
        },
      }),
    ).toThrow();
  });
});

function buildImageSet() {
  return {
    id: "image-set-1",
    completedAt: "2026-06-05T10:21:00.000Z",
    imageModelProvenance: {
      model: "image-model-v1",
      provider: "ai-gateway",
    },
    selectedImageOriginal: {
      id: "selected-original-1",
      newsLinkedImageId: "news-linked-image-1",
      url: "https://example.com/news-linked-image.jpg",
      altText: "Product launch screenshot.",
      preparedAt: "2026-06-05T10:20:00.000Z",
      sourceUrl: "https://example.com/report",
      title: "Launch visual",
    },
    options: [
      {
        id: "image-option-original-1",
        kind: "original",
        label: "Original",
        url: "https://example.com/news-linked-image.jpg",
        altText: "Product launch screenshot.",
      },
      {
        id: "image-option-variation-1",
        kind: "variation",
        label: "Variation 1",
        url: "https://example.com/generated-1.jpg",
        altText: "Generated visual variation 1.",
      },
      {
        id: "image-option-variation-2",
        kind: "variation",
        label: "Variation 2",
        url: "https://example.com/generated-2.jpg",
        altText: "Generated visual variation 2.",
      },
    ],
  };
}
