import { describe, expect, test } from "vitest";
import { type ImageSet, parseImageSet } from "@/services/generation";
import { buildImageSet, buildUploadedImageSet } from "@/services/generation/test-fixtures";
import { findSelectedVariation } from "./quote-tweet-selection";

describe("findSelectedVariation across image sets", () => {
  const imageSet: ImageSet = parseImageSet(buildImageSet());
  const uploadedImageSet: ImageSet = parseImageSet(buildUploadedImageSet());
  const selectedAt = "2026-06-06T10:14:00.000Z";

  test("resolves a variation from the source-derived set", () => {
    const variation = findSelectedVariation([imageSet, uploadedImageSet], {
      imageOptionId: "image-option-variation-3",
      selectedAt,
    });

    expect(variation).toMatchObject({ id: "image-option-variation-3", kind: "variation" });
  });

  test("resolves a variation from a completed uploaded set", () => {
    const variation = findSelectedVariation([imageSet, uploadedImageSet], {
      imageOptionId: "uploaded-option-variation-2",
      selectedAt,
    });

    expect(variation).toMatchObject({ id: "uploaded-option-variation-2", kind: "variation" });
  });

  test("resolves an uploaded variation with no source-derived set present", () => {
    const variation = findSelectedVariation([uploadedImageSet], {
      imageOptionId: "uploaded-option-variation-1",
      selectedAt,
    });

    expect(variation).toMatchObject({ id: "uploaded-option-variation-1", kind: "variation" });
  });

  test("never resolves an original, in any set", () => {
    expect(
      findSelectedVariation([imageSet, uploadedImageSet], {
        imageOptionId: "uploaded-option-original",
        selectedAt,
      }),
    ).toBeNull();
  });

  test("returns null for an id that belongs to no set", () => {
    expect(
      findSelectedVariation([imageSet, uploadedImageSet], {
        imageOptionId: "image-option-missing",
        selectedAt,
      }),
    ).toBeNull();
  });

  test("returns null when nothing is selected", () => {
    expect(findSelectedVariation([imageSet, uploadedImageSet], null)).toBeNull();
  });

  test("returns null when there are no sets", () => {
    expect(
      findSelectedVariation([], { imageOptionId: "image-option-variation-1", selectedAt }),
    ).toBeNull();
  });
});
