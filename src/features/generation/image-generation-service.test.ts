import { describe, expect, test, vi } from "vitest";
import type { NewsLinkedImage } from "./generation-events";
import {
  generateImageSetsForRun,
  type PreparedSelectedImageOriginal,
  prepareSelectedImageOriginal,
} from "./image-generation-service";

describe("image generation service", () => {
  test("resolves selected images, prepares originals, and calls one image model sequentially", async () => {
    const calls: string[] = [];
    const provider = {
      imageModelProvenance: {
        model: "image-model-v1",
        provider: "test-provider",
      },
      async generateVariations(input: {
        original: PreparedSelectedImageOriginal;
        userImagePrompt: string;
        variationCount: 2;
      }) {
        calls.push(
          `provider:${input.original.selectedImageOriginal.newsLinkedImageId}`,
        );

        return [
          {
            altText: "Generated visual variation 1.",
            url: `https://example.com/${input.original.selectedImageOriginal.newsLinkedImageId}-variation-1.jpg`,
          },
          {
            altText: "Generated visual variation 2.",
            url: `https://example.com/${input.original.selectedImageOriginal.newsLinkedImageId}-variation-2.jpg`,
          },
        ];
      },
    };

    const result = await generateImageSetsForRun(
      {
        input: {
          parentRunId: "run-1",
          selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
          userImagePrompt: "Make it feel like a product launch image.",
        },
        parentRun: {
          id: "run-1",
          newsLinkedImages: buildNewsLinkedImages(),
        },
      },
      {
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        prepareSelectedImageOriginal: async ({ newsLinkedImage }) => {
          calls.push(`prepare:${newsLinkedImage.id}`);

          return buildPreparedOriginal(newsLinkedImage);
        },
        provider,
      },
    );

    expect(calls).toEqual([
      "prepare:news-linked-image-1",
      "provider:news-linked-image-1",
      "prepare:news-linked-image-2",
      "provider:news-linked-image-2",
    ]);
    expect(result.imageModelProvenance).toEqual({
      model: "image-model-v1",
      provider: "test-provider",
    });
    expect(result.failedImageSets).toEqual([]);
    expect(result.selectedImageOriginals).toEqual([
      expect.objectContaining({
        id: "selected-original-news-linked-image-1",
        newsLinkedImageId: "news-linked-image-1",
      }),
      expect.objectContaining({
        id: "selected-original-news-linked-image-2",
        newsLinkedImageId: "news-linked-image-2",
      }),
    ]);
    expect(result.imageSets).toEqual([
      expect.objectContaining({
        id: "image-set-news-linked-image-1",
        imageModelProvenance: {
          model: "image-model-v1",
          provider: "test-provider",
        },
        options: [
          expect.objectContaining({
            kind: "original",
            label: "Original",
          }),
          expect.objectContaining({
            kind: "variation",
            label: "Variation 1",
          }),
          expect.objectContaining({
            kind: "variation",
            label: "Variation 2",
          }),
        ],
      }),
      expect.objectContaining({
        id: "image-set-news-linked-image-2",
      }),
    ]);
  });

  test("rejects unknown selected image IDs before preparation or provider calls", async () => {
    const prepareSelectedImageOriginal = vi.fn();
    const provider = {
      imageModelProvenance: {
        model: "image-model-v1",
      },
      generateVariations: vi.fn(),
    };

    await expect(
      generateImageSetsForRun(
        {
          input: {
            parentRunId: "run-1",
            selectedImageIds: ["news-linked-image-1", "missing-image"],
            userImagePrompt: "Use the selected original.",
          },
          parentRun: {
            id: "run-1",
            newsLinkedImages: buildNewsLinkedImages(),
          },
        },
        {
          prepareSelectedImageOriginal,
          provider,
        },
      ),
    ).rejects.toThrow("missing-image");
    expect(prepareSelectedImageOriginal).not.toHaveBeenCalled();
    expect(provider.generateVariations).not.toHaveBeenCalled();
  });

  test("keeps successful image sets when a later selected image fails without retry or fallback", async () => {
    const generateVariations = vi
      .fn()
      .mockResolvedValueOnce([
        {
          url: "https://example.com/generated-1.jpg",
        },
        {
          url: "https://example.com/generated-2.jpg",
        },
      ])
      .mockRejectedValueOnce(new Error("The configured image model failed."));
    const provider = {
      imageModelProvenance: {
        model: "image-model-v1",
        provider: "test-provider",
      },
      generateVariations,
    };

    const result = await generateImageSetsForRun(
      {
        input: {
          parentRunId: "run-1",
          selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
          userImagePrompt: "Generate launch imagery.",
        },
        parentRun: {
          id: "run-1",
          newsLinkedImages: buildNewsLinkedImages(),
        },
      },
      {
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        prepareSelectedImageOriginal: async ({ newsLinkedImage }) =>
          buildPreparedOriginal(newsLinkedImage),
        provider,
      },
    );

    expect(generateVariations).toHaveBeenCalledTimes(2);
    expect(
      generateVariations.mock.calls.map(([input]) => input.variationCount),
    ).toEqual([2, 2]);
    expect(result.imageSets).toHaveLength(1);
    expect(result.failedImageSets).toEqual([
      expect.objectContaining({
        message: "The configured image model failed.",
        selectedImageId: "news-linked-image-2",
        selectedImageOriginal: expect.objectContaining({
          newsLinkedImageId: "news-linked-image-2",
        }),
      }),
    ]);
  });

  test("fetches and prepares selected image originals server-side", async () => {
    const originalFetch = globalThis.fetch;
    const fetch = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: {
          "content-type": "image/png",
        },
        status: 200,
      }),
    );

    globalThis.fetch = fetch;

    try {
      const prepared = await prepareSelectedImageOriginal({
        newsLinkedImage: buildNewsLinkedImages()[0],
        now: () => new Date("2026-06-05T10:20:00.000Z"),
      });

      expect(fetch).toHaveBeenCalledWith(
        "https://example.com/news-linked-image-1.jpg",
      );
      expect(prepared).toEqual({
        dataUrl: "data:image/png;base64,AQID",
        mediaType: "image/png",
        selectedImageOriginal: {
          altText: "Product launch screenshot.",
          id: "selected-original-news-linked-image-1",
          newsLinkedImageId: "news-linked-image-1",
          preparedAt: "2026-06-05T10:20:00.000Z",
          sourceUrl: "https://example.com/report",
          title: "Launch visual 1",
          url: "https://example.com/news-linked-image-1.jpg",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

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
