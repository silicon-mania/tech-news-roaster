import { describe, expect, test } from "vitest";
import { parseImageGenerationStreamEvent } from "@/services/generation";
import { buildImageSet } from "./test-fixtures";

describe("image generation stream event contracts", () => {
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
          status: "completed",
          completedAt: "2026-06-05T10:25:00.000Z",
          imageSet,
        },
      }),
    ).toMatchObject({
      type: "image-generation-completed",
      state: {
        status: "completed",
      },
    });
    expect(
      parseImageGenerationStreamEvent({
        type: "image-generation-completed",
        state: {
          status: "failed",
          completedAt: "2026-06-05T10:25:00.000Z",
          failedImageSet,
        },
      }),
    ).toMatchObject({
      type: "image-generation-completed",
      state: {
        status: "failed",
      },
    });
    expect(() =>
      parseImageGenerationStreamEvent({
        type: "image-generation-completed",
        state: {
          status: "completed",
          completedAt: "2026-06-05T10:25:00.000Z",
          failedImageSet,
        },
      }),
    ).toThrow();
  });
});
