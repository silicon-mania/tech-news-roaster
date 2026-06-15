import { describe, expect, test, vi } from "vitest";
import type { ImageOriginalCandidate } from "@/services/generation";
import {
  generateImageSetsForRun,
  type PreparedSelectedImageOriginal,
  prepareSelectedImageOriginal,
} from "./image-generation-service";

describe("image generation service", () => {
  test("resolves selected candidates, prepares originals, and calls one image model sequentially", async () => {
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
        calls.push(`provider:${input.original.selectedImageOriginal.candidateId}`);

        return [
          {
            altText: "Generated visual variation 1.",
            url: `https://example.com/${input.original.selectedImageOriginal.candidateId}-variation-1.jpg`,
          },
          {
            altText: "Generated visual variation 2.",
            url: `https://example.com/${input.original.selectedImageOriginal.candidateId}-variation-2.jpg`,
          },
        ];
      },
    };

    const result = await generateImageSetsForRun(
      {
        input: {
          parentRunId: "run-1",
          selectedImageIds: ["candidate-1", "candidate-2"],
          userImagePrompt: "Make it feel like a product launch image.",
        },
        parentRun: {
          id: "run-1",
          imageOriginalCandidates: buildImageOriginalCandidates(),
        },
      },
      {
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        prepareSelectedImageOriginal: async ({ candidate }) => {
          calls.push(`prepare:${candidate.id}`);

          return buildPreparedOriginal(candidate);
        },
        provider,
      },
    );

    expect(calls).toEqual([
      "prepare:candidate-1",
      "provider:candidate-1",
      "prepare:candidate-2",
      "provider:candidate-2",
    ]);
    expect(result.imageModelProvenance).toEqual({
      model: "image-model-v1",
      provider: "test-provider",
    });
    expect(result.failedImageSets).toEqual([]);
    // The selected original keeps a pointer back to its candidate and origin, so a
    // Source Tweet image flows through exactly like a News-Linked one.
    expect(result.selectedImageOriginals).toEqual([
      expect.objectContaining({
        id: "selected-original-candidate-1",
        candidateId: "candidate-1",
        origin: "source-tweet-media",
      }),
      expect.objectContaining({
        id: "selected-original-candidate-2",
        candidateId: "candidate-2",
        origin: "news-linked-image",
      }),
    ]);
    expect(result.imageSets).toEqual([
      expect.objectContaining({
        id: "image-set-candidate-1",
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
        id: "image-set-candidate-2",
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
            selectedImageIds: ["candidate-1", "missing-image"],
            userImagePrompt: "Use the selected original.",
          },
          parentRun: {
            id: "run-1",
            imageOriginalCandidates: buildImageOriginalCandidates(),
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

  test("uses AI Gateway chat completions for selected-candidate variations", async () => {
    const previousApiKey = process.env.AI_GATEWAY_API_KEY;
    const previousBaseUrl = process.env.AI_GATEWAY_BASE_URL;
    const previousImageModel = process.env.AI_GATEWAY_IMAGE_MODEL;
    const previousFetch = globalThis.fetch;
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: "Generated launch-ready variation.",
              images: [
                {
                  type: "image_url",
                  image_url: {
                    url: "data:image/png;base64,generated-image",
                  },
                },
              ],
            },
          },
        ],
      }),
    );

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_BASE_URL = "https://ai-gateway.example/v1";
    process.env.AI_GATEWAY_IMAGE_MODEL = "google/gemini-2.5-flash-image";
    globalThis.fetch = fetcher;

    try {
      const result = await generateImageSetsForRun(
        {
          input: {
            parentRunId: "run-1",
            selectedImageIds: ["candidate-1"],
            userImagePrompt: "Make it feel like a launch visual.",
          },
          parentRun: {
            id: "run-1",
            imageOriginalCandidates: buildImageOriginalCandidates(),
          },
        },
        {
          now: () => new Date("2026-06-05T10:20:00.000Z"),
          prepareSelectedImageOriginal: async ({ candidate }) => buildPreparedOriginal(candidate),
        },
      );

      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(fetcher).toHaveBeenNthCalledWith(
        1,
        "https://ai-gateway.example/v1/chat/completions",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer gateway-secret",
          }),
          method: "POST",
        }),
      );
      const firstCallInit = fetcher.mock.calls[0]?.[1];

      expect(JSON.parse(String(firstCallInit?.body))).toEqual(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining("Make it feel like a launch visual."),
                  type: "text",
                }),
                expect.objectContaining({
                  image_url: {
                    url: "data:image/jpeg;base64,candidate-1",
                  },
                  type: "image_url",
                }),
              ]),
            }),
          ],
          model: "google/gemini-2.5-flash-image",
        }),
      );
      expect(result.imageSets[0]?.options[1]).toMatchObject({
        label: "Variation 1",
        url: "data:image/png;base64,generated-image",
      });
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousApiKey);
      restoreEnvValue("AI_GATEWAY_BASE_URL", previousBaseUrl);
      restoreEnvValue("AI_GATEWAY_IMAGE_MODEL", previousImageModel);
      globalThis.fetch = previousFetch;
    }
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
          selectedImageIds: ["candidate-1", "candidate-2"],
          userImagePrompt: "Generate launch imagery.",
        },
        parentRun: {
          id: "run-1",
          imageOriginalCandidates: buildImageOriginalCandidates(),
        },
      },
      {
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        prepareSelectedImageOriginal: async ({ candidate }) => buildPreparedOriginal(candidate),
        provider,
      },
    );

    expect(generateVariations).toHaveBeenCalledTimes(2);
    expect(generateVariations.mock.calls.map(([input]) => input.variationCount)).toEqual([2, 2]);
    expect(result.imageSets).toHaveLength(1);
    expect(result.failedImageSets).toEqual([
      expect.objectContaining({
        message: "The configured image model failed.",
        selectedImageId: "candidate-2",
        selectedImageOriginal: expect.objectContaining({
          candidateId: "candidate-2",
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
        candidate: buildImageOriginalCandidates()[1],
        now: () => new Date("2026-06-05T10:20:00.000Z"),
      });

      expect(fetch).toHaveBeenCalledWith("https://example.com/candidate-2.jpg");
      expect(prepared).toEqual({
        dataUrl: "data:image/png;base64,AQID",
        mediaType: "image/png",
        selectedImageOriginal: {
          altText: "Executive demo image.",
          candidateId: "candidate-2",
          id: "selected-original-candidate-2",
          origin: "news-linked-image",
          preparedAt: "2026-06-05T10:20:00.000Z",
          sourceUrl: "https://example.com/report",
          title: "Launch visual 2",
          url: "https://example.com/candidate-2.jpg",
        },
      });
    } finally {
      globalThis.fetch = originalFetch;
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

function buildImageOriginalCandidates(): ImageOriginalCandidate[] {
  return [
    {
      altText: "Source tweet launch screenshot.",
      id: "candidate-1",
      origin: "source-tweet-media",
      previewUrl: "https://example.com/candidate-1-preview.jpg",
      url: "https://example.com/candidate-1.jpg",
    },
    {
      altText: "Executive demo image.",
      id: "candidate-2",
      origin: "news-linked-image",
      sourceUrl: "https://example.com/report",
      title: "Launch visual 2",
      url: "https://example.com/candidate-2.jpg",
    },
  ];
}

function buildPreparedOriginal(candidate: ImageOriginalCandidate): PreparedSelectedImageOriginal {
  return {
    dataUrl: `data:image/jpeg;base64,${candidate.id}`,
    mediaType: "image/jpeg",
    selectedImageOriginal: {
      altText: candidate.altText,
      candidateId: candidate.id,
      id: `selected-original-${candidate.id}`,
      origin: candidate.origin,
      preparedAt: "2026-06-05T10:20:00.000Z",
      sourceUrl: candidate.sourceUrl,
      title: candidate.title,
      url: candidate.url,
    },
  };
}
