import { describe, expect, test, vi } from "vitest";
import {
  type ImageGenerationInput,
  type ImageGenerationParentRun,
  type NewsLinkedImage,
  parseImageGenerationStreamEvent,
} from "@/services/generation/generation-events";
import type {
  ImageVariationProvider,
  PreparedSelectedImageOriginal,
} from "@/services/generation/image-generation-service";
import { streamImageGenerationRun } from "./route";

describe("image generation stream route", () => {
  test("streams completed image sets sequentially from an active text-generation run", async () => {
    const calls: string[] = [];
    const parentRun = buildParentRun({
      imageGenerationState: {
        status: "not-started",
      },
      phase: "text-generation-running",
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
            calls.push(`provider:${original.selectedImageOriginal.newsLinkedImageId}`);

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

  test("uses only the User Image Prompt to steer image generation", async () => {
    const generateVariations = vi.fn<ImageVariationProvider["generateVariations"]>(
      async ({ original }) => [
        {
          url: `https://example.com/${original.selectedImageOriginal.newsLinkedImageId}-variation-1.jpg`,
        },
        {
          url: `https://example.com/${original.selectedImageOriginal.newsLinkedImageId}-variation-2.jpg`,
        },
      ],
    );
    const response = await streamImageGenerationRun(
      buildRequest({
        input: buildInput({
          selectedImageIds: ["news-linked-image-1"],
          userImagePrompt: "Make the visual launch-ready.",
        }),
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

    await readImageGenerationStreamEvents(response);

    expect(generateVariations).toHaveBeenCalledTimes(1);
    expect(generateVariations).toHaveBeenCalledWith(
      expect.objectContaining({
        userImagePrompt: "Make the visual launch-ready.",
      }),
    );
    expect(JSON.stringify(generateVariations.mock.calls)).not.toContain("platform risk");
  });

  test("rejects joke and context fields in the image generation parent run", async () => {
    const response = await streamImageGenerationRun(
      buildRequest({
        input: buildInput({
          selectedImageIds: ["news-linked-image-1"],
        }),
        parentRun: {
          ...buildParentRun({
            imageGenerationState: {
              status: "not-started",
            },
          }),
          selectedVisualJoke: {
            selectedAt: "2026-06-05T10:19:00.000Z",
            visualJokeId: "visual-joke-1",
          },
          usersDirection: "Make the text skeptical about platform risk.",
          visualJokeDirection: "Internal visual joke direction.",
        },
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      message: expect.stringContaining("Unrecognized key"),
    });
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
          selectedImageIds: ["news-linked-image-1", "news-linked-image-2", "news-linked-image-3"],
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
      const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "));

      if (!dataLine) {
        throw new Error("Missing SSE data line.");
      }

      return parseImageGenerationStreamEvent(JSON.parse(dataLine.replace("data: ", "")));
    });
}

function buildRequest(body: unknown) {
  return new Request("https://tech-news-roaster.test/api/generation-runs/image-generation/stream", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });
}

function buildInput(overrides: Partial<ImageGenerationInput> = {}): ImageGenerationInput {
  return {
    parentRunId: "saved-run",
    selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
    userImagePrompt: "Make it feel like a serious product launch image.",
    ...overrides,
  };
}

function buildParentRun(
  overrides: Partial<ImageGenerationParentRun> = {},
): ImageGenerationParentRun {
  return {
    id: "saved-run",
    newsLinkedImages: buildNewsLinkedImages(),
    phase: "waiting-for-image-selection",
    ...overrides,
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

function buildPreparedOriginal(newsLinkedImage: NewsLinkedImage): PreparedSelectedImageOriginal {
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

function buildProvider(overrides: Partial<ImageVariationProvider> = {}): ImageVariationProvider {
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
