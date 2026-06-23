import { describe, expect, test } from "vitest";
import { parseFailedImageSet, parseImageSet } from "@/services/generation";
import { buildImageSet, buildUploadedImageSet } from "@/services/generation/test-fixtures";
import { isCompleteRun } from "./run-phase";
import type { GenerationRun } from "./types";

const imageSet = parseImageSet(buildImageSet());
const uploadedImageSet = parseImageSet(buildUploadedImageSet());
const failedImageSet = parseFailedImageSet({
  id: "failed-image-set-1",
  failedAt: "2026-06-05T10:22:00.000Z",
  message: "The configured image model failed.",
  selectedImageId: "news-linked-image-1",
});

function buildSavedDraft(id: string): GenerationRun["drafts"][number] {
  return {
    angle: "platform leverage",
    id,
    modelProvenance: "local draft model",
    provider: "openai",
    text: `Quote-tweet draft ${id}.`,
    visibleRationale: "Frames the news around platform leverage.",
  };
}

// A fully-complete run: at least one draft and an image set carrying variations.
// Each test strips exactly one piece.
function buildRun(overrides: Partial<GenerationRun> = {}): GenerationRun {
  return {
    id: "saved-run",
    label: "Saved run",
    sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
    usersDirection: "Keep it dry.",
    status: "completed",
    draftCount: 1,
    draftTarget: 3,
    drafts: [buildSavedDraft("draft-openai")],
    imageSet,
    ...overrides,
    uploadedImageSets: overrides.uploadedImageSets ?? [],
  };
}

describe("isCompleteRun", () => {
  test("returns true for a run with a draft and an image variation", () => {
    expect(isCompleteRun(buildRun())).toBe(true);
  });

  test("returns false when the run has no drafts", () => {
    expect(isCompleteRun(buildRun({ draftCount: 0, drafts: [] }))).toBe(false);
  });

  test("returns false when image generation failed (failed image set, no variations)", () => {
    expect(isCompleteRun(buildRun({ failedImageSet, imageSet: undefined }))).toBe(false);
  });

  test("returns false when the run has no image set at all", () => {
    expect(isCompleteRun(buildRun({ imageSet: undefined }))).toBe(false);
  });

  test("returns true for an upload-only run — no source-derived set, a completed uploaded set", () => {
    expect(
      isCompleteRun(
        buildRun({
          imageSet: undefined,
          uploadedImageSets: [{ imageSet: uploadedImageSet, status: "completed" }],
        }),
      ),
    ).toBe(true);
  });

  test("returns false when the only uploaded set failed (no variations anywhere)", () => {
    expect(
      isCompleteRun(
        buildRun({
          imageSet: undefined,
          uploadedImageSets: [{ failedImageSet, status: "failed" }],
        }),
      ),
    ).toBe(false);
  });
});
