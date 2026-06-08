import { describe, expect, test, vi } from "vitest";
import {
  draftTarget,
  type GenerationProviderId,
  type ImageGenerationInput,
  type NewsLinkedImage,
  parseImageGenerationStreamEvent,
  type QuoteTweetDraft,
  type SavedGenerationRun,
} from "@/features/generation/generation-events";
import type {
  ImageVariationProvider,
  PreparedSelectedImageOriginal,
} from "@/features/generation/image-generation-service";
import { buildFixtureTweetContext } from "@/features/tweet-retrieval/tweet-retrieval";
import { streamImageGenerationRun } from "./route";

describe("image generation stream route", () => {
  test("streams completed image sets sequentially from an active text-generation run", async () => {
    const calls: string[] = [];
    const parentRun = buildParentRun({
      draftCount: 1,
      drafts: [
        buildSavedDraft({
          id: "draft-openai",
          provider: "openai",
          text: "Quote-tweet draft: first partial draft.",
        }),
      ],
      imageGenerationState: {
        status: "not-started",
      },
      phase: "text-generation-running",
      status: "running",
    });
    const response = await streamImageGenerationRun(
      buildRequest({
        input: buildInput(),
        parentRun,
      }),
      {
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        prepareSelectedImageOriginal: async ({ newsLinkedImage }) => {
          calls.push(`prepare:${newsLinkedImage.id}`);

          return buildPreparedOriginal(newsLinkedImage);
        },
        provider: buildProvider({
          async generateVariations({ original }) {
            calls.push(
              `provider:${original.selectedImageOriginal.newsLinkedImageId}`,
            );

            return [
              {
                url: `https://example.com/${original.selectedImageOriginal.newsLinkedImageId}-variation-1.jpg`,
              },
              {
                url: `https://example.com/${original.selectedImageOriginal.newsLinkedImageId}-variation-2.jpg`,
              },
            ];
          },
        }),
      },
    );
    const events = await readImageGenerationStreamEvents(response);

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(calls).toEqual([
      "prepare:news-linked-image-1",
      "provider:news-linked-image-1",
      "prepare:news-linked-image-2",
      "provider:news-linked-image-2",
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "image-set-completed",
      "image-set-completed",
      "image-generation-completed",
    ]);
    expect(events[0]).toMatchObject({
      type: "image-set-completed",
      imageSet: {
        id: "image-set-news-linked-image-1",
        selectedImageOriginal: {
          newsLinkedImageId: "news-linked-image-1",
        },
      },
    });
    expect(events[1]).toMatchObject({
      type: "image-set-completed",
      imageSet: {
        id: "image-set-news-linked-image-2",
      },
    });
    expect(events[2]).toMatchObject({
      type: "image-generation-completed",
      state: {
        failedImageSets: [],
        imageSets: [
          expect.objectContaining({
            id: "image-set-news-linked-image-1",
          }),
          expect.objectContaining({
            id: "image-set-news-linked-image-2",
          }),
        ],
        status: "completed",
      },
    });
  });

  test("can start from a reopened saved run that never started image generation", async () => {
    const parentRun = buildParentRun({
      imageGenerationState: {
        status: "not-started",
      },
      phase: "waiting-for-image-selection",
      savedAt: "2026-06-05T10:20:00.000Z",
      status: "completed",
    });
    const response = await streamImageGenerationRun(
      buildRequest({
        input: buildInput({
          selectedImageIds: ["news-linked-image-1"],
        }),
        parentRun,
      }),
      {
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        prepareSelectedImageOriginal: async ({ newsLinkedImage }) =>
          buildPreparedOriginal(newsLinkedImage),
        provider: buildProvider(),
      },
    );
    const events = await readImageGenerationStreamEvents(response);

    expect(response.status).toBe(200);
    expect(events.map((event) => event.type)).toEqual([
      "image-set-completed",
      "image-generation-completed",
    ]);
  });

  test("streams failed image sets without dropping earlier successful sets", async () => {
    const generateVariations = vi
      .fn<ImageVariationProvider["generateVariations"]>()
      .mockResolvedValueOnce([
        {
          url: "https://example.com/generated-1.jpg",
        },
        {
          url: "https://example.com/generated-2.jpg",
        },
      ])
      .mockRejectedValueOnce(new Error("The configured image model failed."));
    const response = await streamImageGenerationRun(
      buildRequest({
        input: buildInput(),
        parentRun: buildParentRun({
          imageGenerationState: {
            status: "not-started",
          },
          phase: "waiting-for-image-selection",
        }),
      }),
      {
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        prepareSelectedImageOriginal: async ({ newsLinkedImage }) =>
          buildPreparedOriginal(newsLinkedImage),
        provider: buildProvider({
          generateVariations,
        }),
      },
    );
    const events = await readImageGenerationStreamEvents(response);

    expect(generateVariations).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.type)).toEqual([
      "image-set-completed",
      "image-set-failed",
      "image-generation-completed",
    ]);
    expect(events[1]).toMatchObject({
      type: "image-set-failed",
      failedImageSet: {
        message: "The configured image model failed.",
        selectedImageId: "news-linked-image-2",
      },
    });
    expect(events[2]).toMatchObject({
      type: "image-generation-completed",
      state: {
        failedImageSets: [
          expect.objectContaining({
            selectedImageId: "news-linked-image-2",
          }),
        ],
        imageSets: [
          expect.objectContaining({
            id: "image-set-news-linked-image-1",
          }),
        ],
        status: "partially-failed",
      },
    });
  });

  test.each([
    {
      name: "missing prompt",
      body: {
        input: buildInput({
          userImagePrompt: " ",
        }),
        parentRun: buildParentRun({
          imageGenerationState: {
            status: "not-started",
          },
        }),
      },
    },
    {
      name: "invalid selected image ID",
      body: {
        input: buildInput({
          selectedImageIds: ["news-linked-image-1", "missing-image"],
        }),
        parentRun: buildParentRun({
          imageGenerationState: {
            status: "not-started",
          },
        }),
      },
    },
    {
      name: "more than two selected images",
      body: {
        input: buildInput({
          selectedImageIds: [
            "news-linked-image-1",
            "news-linked-image-2",
            "news-linked-image-3",
          ],
        }),
        parentRun: buildParentRun({
          imageGenerationState: {
            status: "not-started",
          },
        }),
      },
    },
    {
      name: "second image generation attempt",
      body: {
        input: buildInput(),
        parentRun: buildParentRun({
          imageGenerationState: {
            selectedImageIds: ["news-linked-image-1"],
            startedAt: "2026-06-05T10:20:00.000Z",
            status: "running",
            userImagePrompt: "Already started.",
          },
        }),
      },
    },
  ])("rejects $name before opening the stream", async ({ body }) => {
    const response = await streamImageGenerationRun(buildRequest(body));

    expect(response.status).toBe(400);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});

async function readImageGenerationStreamEvents(response: Response) {
  const rawEvents = await response.text();

  return rawEvents
    .trim()
    .split("\n\n")
    .map((rawEvent) => {
      const dataLine = rawEvent
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) {
        throw new Error("Missing SSE data line.");
      }

      return parseImageGenerationStreamEvent(
        JSON.parse(dataLine.replace("data: ", "")),
      );
    });
}

function buildRequest(body: unknown) {
  return new Request(
    "https://tech-news-roaster.test/api/generation-runs/image-generation/stream",
    {
      body: JSON.stringify(body),
      headers: {
        "Content-Type": "application/json",
      },
      method: "POST",
    },
  );
}

function buildInput(
  overrides: Partial<ImageGenerationInput> = {},
): ImageGenerationInput {
  return {
    parentRunId: "saved-run",
    selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
    userImagePrompt: "Make it feel like a serious product launch image.",
    ...overrides,
  };
}

function buildParentRun(
  overrides: Partial<SavedGenerationRun> = {},
): SavedGenerationRun {
  const tweetContext = buildFixtureTweetContext(
    "https://x.com/siliconmania/status/1234567890",
  );

  return {
    id: "saved-run",
    label: "Saved run",
    sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
    usersDirection: "Keep it dry.",
    status: "completed",
    draftCount: 3,
    draftTarget,
    drafts: [
      buildSavedDraft({
        id: "draft-openai",
        provider: "openai",
        text: "Quote-tweet draft: first saved draft.",
      }),
      buildSavedDraft({
        id: "draft-anthropic",
        provider: "anthropic",
        text: "Quote-tweet draft: second saved draft.",
      }),
      buildSavedDraft({
        id: "draft-google",
        provider: "google",
        text: "Quote-tweet draft: third saved draft.",
      }),
    ],
    newsLinkedImages: buildNewsLinkedImages(),
    phase: "waiting-for-image-selection",
    sourceTweet: tweetContext.sourceTweet,
    ...overrides,
  };
}

function buildSavedDraft({
  id,
  provider,
  text,
}: {
  id: string;
  provider: GenerationProviderId;
  text: string;
}): QuoteTweetDraft {
  return {
    angle: `${provider} angle`,
    id,
    modelProvenance: `${provider} local draft model`,
    provider,
    text,
    visibleRationale: `${provider} rationale.`,
  };
}

function buildNewsLinkedImages(): NewsLinkedImage[] {
  return [
    {
      altText: "Product launch screenshot.",
      id: "news-linked-image-1",
      sourceUrl: "https://example.com/report",
      title: "Launch visual 1",
      url: "https://example.com/news-linked-image-1.jpg",
    },
    {
      altText: "Executive demo image.",
      id: "news-linked-image-2",
      sourceUrl: "https://example.com/report",
      title: "Launch visual 2",
      url: "https://example.com/news-linked-image-2.jpg",
    },
    {
      altText: "Product roadmap screenshot.",
      id: "news-linked-image-3",
      sourceUrl: "https://example.com/report",
      title: "Launch visual 3",
      url: "https://example.com/news-linked-image-3.jpg",
    },
  ];
}

function buildPreparedOriginal(
  newsLinkedImage: NewsLinkedImage,
): PreparedSelectedImageOriginal {
  return {
    dataUrl: `data:image/jpeg;base64,${newsLinkedImage.id}`,
    mediaType: "image/jpeg",
    selectedImageOriginal: {
      altText: newsLinkedImage.altText,
      id: `selected-original-${newsLinkedImage.id}`,
      newsLinkedImageId: newsLinkedImage.id,
      preparedAt: "2026-06-05T10:20:00.000Z",
      sourceUrl: newsLinkedImage.sourceUrl,
      title: newsLinkedImage.title,
      url: newsLinkedImage.url,
    },
  };
}

function buildProvider(
  overrides: Partial<ImageVariationProvider> = {},
): ImageVariationProvider {
  return {
    imageModelProvenance: {
      model: "image-model-v1",
      provider: "test-provider",
    },
    async generateVariations({ original }) {
      return [
        {
          url: `https://example.com/${original.selectedImageOriginal.newsLinkedImageId}-variation-1.jpg`,
        },
        {
          url: `https://example.com/${original.selectedImageOriginal.newsLinkedImageId}-variation-2.jpg`,
        },
      ];
    },
    ...overrides,
  };
}
