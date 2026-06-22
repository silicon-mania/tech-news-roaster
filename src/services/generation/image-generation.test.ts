import { describe, expect, test } from "vitest";
import {
  type ImageSet,
  parseImageGenerationInput,
  parseImageSet,
  parseSelectedGeneratedImage,
} from "@/services/generation";
import { buildImageSet, buildUploadedImageSet } from "./test-fixtures";

describe("image generation contracts", () => {
  test("validates image-generation input and rejects raw URL submission", () => {
    expect(
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageId: "news-linked-image-1",
        userImagePrompt: "Make the product visual punchier.",
      }),
    ).toEqual({
      parentRunId: "run-1",
      selectedImageId: "news-linked-image-1",
      userImagePrompt: "Make the product visual punchier.",
    });
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageId: "https://example.com/image.jpg",
        userImagePrompt: "Use this URL.",
      }),
    ).toThrow();
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageIds: ["news-linked-image-1"],
        userImagePrompt: "A run carries exactly one selected image original.",
      }),
    ).toThrow();
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageId: "news-linked-image-1",
        userImagePrompt: " ",
      }),
    ).toThrow();
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-1",
        selectedImageId: "news-linked-image-1",
        imageUrls: ["https://example.com/image.jpg"],
        userImagePrompt: "Reject unknown raw URL fields.",
      }),
    ).toThrow();
  });
});

describe("selected generated image validator", () => {
  const imageSet: ImageSet = parseImageSet(buildImageSet());
  // A second, completed Uploaded Image Set with its own globally-unique option
  // ids — the cross-set resolution case (ADR-0025).
  const uploadedImageSet: ImageSet = parseImageSet(buildUploadedImageSet());

  test("accepts a variation id that exists in the run's Image Set", () => {
    const selection = {
      imageOptionId: "image-option-variation-1",
      selectedAt: "2026-06-06T10:14:00.000Z",
    };

    expect(parseSelectedGeneratedImage(selection, [imageSet])).toEqual(selection);
  });

  test("accepts the fourth variation id", () => {
    const selection = {
      imageOptionId: "image-option-variation-4",
      selectedAt: "2026-06-06T10:14:00.000Z",
    };

    expect(parseSelectedGeneratedImage(selection, [imageSet])).toEqual(selection);
  });

  test("accepts a variation from an uploaded set when searching across all sets", () => {
    const selection = {
      imageOptionId: "uploaded-option-variation-2",
      selectedAt: "2026-06-06T10:14:00.000Z",
    };

    expect(parseSelectedGeneratedImage(selection, [imageSet, uploadedImageSet])).toEqual(selection);
  });

  test("resolves an uploaded variation even when the run has no source-derived set", () => {
    const selection = {
      imageOptionId: "uploaded-option-variation-1",
      selectedAt: "2026-06-06T10:14:00.000Z",
    };

    expect(parseSelectedGeneratedImage(selection, [uploadedImageSet])).toEqual(selection);
  });

  test("rejects the original Image Option id by degrading to none", () => {
    expect(
      parseSelectedGeneratedImage(
        {
          imageOptionId: "image-option-original-1",
          selectedAt: "2026-06-06T10:14:00.000Z",
        },
        [imageSet],
      ),
    ).toBeNull();
  });

  test("rejects an uploaded set's original across sets by degrading to none", () => {
    expect(
      parseSelectedGeneratedImage(
        {
          imageOptionId: "uploaded-option-original",
          selectedAt: "2026-06-06T10:14:00.000Z",
        },
        [imageSet, uploadedImageSet],
      ),
    ).toBeNull();
  });

  test("rejects an id that belongs to no Image Set by degrading to none", () => {
    expect(
      parseSelectedGeneratedImage(
        {
          imageOptionId: "image-option-missing",
          selectedAt: "2026-06-06T10:14:00.000Z",
        },
        [imageSet, uploadedImageSet],
      ),
    ).toBeNull();
  });

  test("an unresolvable selection degrades to none without throwing", () => {
    expect(() =>
      expect(
        parseSelectedGeneratedImage(
          {
            imageOptionId: "image-option-missing",
            selectedAt: "2026-06-06T10:14:00.000Z",
          },
          [imageSet],
        ),
      ).toBeNull(),
    ).not.toThrow();
  });
});
