import { describe, expect, test } from "vitest";
import { parseImageGenerationInput } from "@/services/generation";

describe("image generation contracts", () => {
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
});
