import { describe, expect, test } from "vitest";
import {
  type ImageSet,
  parseImageGenerationInput,
  parseImageSet,
  parseSelectedGeneratedImage,
} from "@/services/generation";
import { buildImageSet } from "./test-fixtures";

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

  test("accepts a variation id that exists in the run's Image Set", () => {
    const selection = {
      imageOptionId: "image-option-variation-1",
      selectedAt: "2026-06-06T10:14:00.000Z",
    };

    expect(parseSelectedGeneratedImage(selection, imageSet)).toEqual(selection);
  });

  test("accepts the fourth variation id", () => {
    const selection = {
      imageOptionId: "image-option-variation-4",
      selectedAt: "2026-06-06T10:14:00.000Z",
    };

    expect(parseSelectedGeneratedImage(selection, imageSet)).toEqual(selection);
  });

  test("rejects the original Image Option id by degrading to none", () => {
    expect(
      parseSelectedGeneratedImage(
        {
          imageOptionId: "image-option-original-1",
          selectedAt: "2026-06-06T10:14:00.000Z",
        },
        imageSet,
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
        imageSet,
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
          imageSet,
        ),
      ).toBeNull(),
    ).not.toThrow();
  });
});
