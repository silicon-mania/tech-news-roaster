import { Buffer } from "node:buffer";
import { describe, expect, test, vi } from "vitest";
import type { ImageOriginalCandidate } from "@/services/generation";
import { defaultImagePrompt } from "./default-image-prompt";
import {
  generateImageSetForRun,
  generateUploadedImageSetForRun,
  type ImageVariationProvider,
  type PreparedSelectedImageOriginal,
  prepareSelectedImageOriginal,
} from "./image-generation-service";

describe("image generation service", () => {
  test("resolves the selected candidate, prepares the original, and generates four variations", async () => {
    const calls: string[] = [];
    const provider = {
      imageModelProvenance: {
        model: "image-model-v1",
        provider: "test-provider",
      },
      async generateVariations(input: {
        original: PreparedSelectedImageOriginal;
        userImagePrompt: string;
        variationCount: number;
      }) {
        calls.push(`provider:${input.original.selectedImageOriginal.candidateId}`);

        return Array.from({ length: input.variationCount }, (_, index) => ({
          altText: `Generated visual variation ${index + 1}.`,
          url: `https://example.com/${input.original.selectedImageOriginal.candidateId}-variation-${
            index + 1
          }.jpg`,
        }));
      },
    };

    const result = await generateImageSetForRun(
      {
        input: {
          parentRunId: "run-1",
          selectedImageId: "candidate-1",
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

    expect(calls).toEqual(["prepare:candidate-1", "provider:candidate-1"]);
    expect(result.imageModelProvenance).toEqual({
      model: "image-model-v1",
      provider: "test-provider",
    });
    expect(result.failedImageSet).toBeUndefined();
    // The selected original keeps a pointer back to its candidate and origin, so a
    // Source Tweet image flows through exactly like a News-Linked one.
    expect(result.selectedImageOriginal).toEqual(
      expect.objectContaining({
        id: "selected-original-candidate-1",
        candidateId: "candidate-1",
        origin: "source-tweet-media",
      }),
    );
    expect(result.imageSet).toEqual(
      expect.objectContaining({
        id: "image-set-candidate-1",
        imageModelProvenance: {
          model: "image-model-v1",
          provider: "test-provider",
        },
        options: [
          expect.objectContaining({ kind: "original", label: "Original" }),
          expect.objectContaining({ kind: "variation", label: "Variation 1" }),
          expect.objectContaining({ kind: "variation", label: "Variation 2" }),
          expect.objectContaining({ kind: "variation", label: "Variation 3" }),
          expect.objectContaining({ kind: "variation", label: "Variation 4" }),
        ],
      }),
    );
  });

  test("rejects an unknown selected image ID before preparation or provider calls", async () => {
    const prepareSelectedImageOriginal = vi.fn();
    const provider = {
      imageModelProvenance: {
        model: "image-model-v1",
      },
      generateVariations: vi.fn(),
    };

    await expect(
      generateImageSetForRun(
        {
          input: {
            parentRunId: "run-1",
            selectedImageId: "missing-image",
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

  test("uses AI Gateway chat completions for the four variations", async () => {
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
      const result = await generateImageSetForRun(
        {
          input: {
            parentRunId: "run-1",
            selectedImageId: "candidate-1",
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

      expect(fetcher).toHaveBeenCalledTimes(4);
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
      expect(result.imageSet?.options[1]).toMatchObject({
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

  test("captures a failed image set without retry or fallback when the provider throws", async () => {
    const generateVariations = vi
      .fn()
      .mockRejectedValueOnce(new Error("The configured image model failed."));
    const provider = {
      imageModelProvenance: {
        model: "image-model-v1",
        provider: "test-provider",
      },
      generateVariations,
    };

    const result = await generateImageSetForRun(
      {
        input: {
          parentRunId: "run-1",
          selectedImageId: "candidate-2",
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

    expect(generateVariations).toHaveBeenCalledTimes(1);
    expect(generateVariations.mock.calls[0]?.[0]?.variationCount).toBe(4);
    expect(result.imageSet).toBeUndefined();
    expect(result.failedImageSet).toEqual(
      expect.objectContaining({
        message: "The configured image model failed.",
        selectedImageId: "candidate-2",
        selectedImageOriginal: expect.objectContaining({
          candidateId: "candidate-2",
        }),
      }),
    );
    // The Quiet Failure Details get the failing step + error chain for debugging.
    expect(result.failedImageSet?.debugLog).toEqual(
      expect.arrayContaining([
        "Error: Error: The configured image model failed.",
        "Step: generate-variations",
      ]),
    );
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

describe("uploaded image generation service", () => {
  test("prepares the original from uploaded bytes and generates four variations with the Default Image Prompt, with no remote fetch", async () => {
    const originalFetch = globalThis.fetch;
    const fetch = vi.fn();
    const generateVariations = vi.fn<ImageVariationProvider["generateVariations"]>(
      async ({ original, variationCount }) =>
        Array.from({ length: variationCount }, (_, index) => ({
          altText: `Uploaded visual variation ${index + 1}.`,
          url: `https://example.com/${original.selectedImageOriginal.candidateId}-variation-${
            index + 1
          }.png`,
        })),
    );

    globalThis.fetch = fetch;

    try {
      const result = await generateUploadedImageSetForRun(
        {
          upload: {
            bytes: Buffer.from("uploaded-bytes"),
            mediaType: "image/png",
          },
          uploadId: "upload-1",
        },
        {
          now: () => new Date("2026-06-05T10:20:00.000Z"),
          provider: {
            generateVariations,
            imageModelProvenance: {
              model: "image-model-v1",
              provider: "test-provider",
            },
          },
        },
      );

      // The uploaded path prepares the original from the bytes in hand — no fetch.
      expect(fetch).not.toHaveBeenCalled();
      expect(generateVariations).toHaveBeenCalledTimes(1);
      expect(generateVariations).toHaveBeenCalledWith(
        expect.objectContaining({
          userImagePrompt: defaultImagePrompt,
          variationCount: 4,
        }),
      );

      const preparedOriginal = generateVariations.mock.calls[0]?.[0]?.original;

      expect(preparedOriginal?.dataUrl).toBe(
        `data:image/png;base64,${Buffer.from("uploaded-bytes").toString("base64")}`,
      );
      expect(preparedOriginal?.selectedImageOriginal.origin).toBe("user-uploaded");

      expect(result.failedImageSet).toBeUndefined();
      expect(result.selectedImageOriginal).toEqual(
        expect.objectContaining({
          candidateId: "uploaded-original-upload-1",
          id: "selected-original-uploaded-original-upload-1",
          origin: "user-uploaded",
        }),
      );
      expect(result.imageSet).toEqual(
        expect.objectContaining({
          id: "uploaded-image-set-upload-1",
          options: [
            expect.objectContaining({
              id: "uploaded-image-set-upload-1-original",
              kind: "original",
              label: "Original",
            }),
            expect.objectContaining({
              id: "uploaded-image-set-upload-1-variation-1",
              kind: "variation",
              label: "Variation 1",
            }),
            expect.objectContaining({ kind: "variation", label: "Variation 2" }),
            expect.objectContaining({ kind: "variation", label: "Variation 3" }),
            expect.objectContaining({ kind: "variation", label: "Variation 4" }),
          ],
        }),
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("captures a failed uploaded set with a debug log when the provider throws", async () => {
    const generateVariations = vi
      .fn<ImageVariationProvider["generateVariations"]>()
      .mockRejectedValueOnce(new Error("The configured image model failed."));

    const result = await generateUploadedImageSetForRun(
      {
        upload: {
          bytes: Buffer.from("uploaded-bytes"),
          mediaType: "image/png",
        },
        uploadId: "upload-2",
      },
      {
        now: () => new Date("2026-06-05T10:20:00.000Z"),
        provider: {
          generateVariations,
          imageModelProvenance: {
            model: "image-model-v1",
            provider: "test-provider",
          },
        },
      },
    );

    expect(generateVariations).toHaveBeenCalledTimes(1);
    expect(result.imageSet).toBeUndefined();
    expect(result.failedImageSet).toEqual(
      expect.objectContaining({
        id: "failed-uploaded-image-set-upload-2",
        message: "The configured image model failed.",
        selectedImageId: "uploaded-original-upload-2",
        selectedImageOriginal: expect.objectContaining({
          origin: "user-uploaded",
        }),
      }),
    );
    expect(result.failedImageSet?.debugLog).toEqual(
      expect.arrayContaining([
        expect.stringContaining("The configured image model failed."),
        "Step: generate-variations",
      ]),
    );
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
