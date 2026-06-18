import { describe, expect, test } from "vitest";
import { parseFailedImageSet, parseImageSet, parseVisualJokeSet } from "@/services/generation";
import { buildImageSet, buildVisualJokeSet } from "@/services/generation/test-fixtures";
import { isCompleteRun } from "./run-phase";
import type { GenerationRun } from "./types";

const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());
const imageSet = parseImageSet(buildImageSet());
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

// A fully-complete run: at least one draft, a visual joke set with jokes, and an
// image set carrying variations. Each test strips exactly one piece.
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
    visualJokeSet,
    imageSet,
    ...overrides,
  };
}

describe("isCompleteRun", () => {
  test("returns true for a run with a draft, a visual joke, and an image variation", () => {
    expect(isCompleteRun(buildRun())).toBe(true);
  });

  test("returns false when the run has no drafts", () => {
    expect(isCompleteRun(buildRun({ draftCount: 0, drafts: [] }))).toBe(false);
  });

  test("returns false when the run has no visual joke set", () => {
    expect(isCompleteRun(buildRun({ visualJokeSet: undefined }))).toBe(false);
  });

  test("returns false when the visual joke set has zero jokes", () => {
    expect(isCompleteRun(buildRun({ visualJokeSet: { ...visualJokeSet, jokes: [] } }))).toBe(false);
  });

  test("returns false when image generation failed (failed image set, no variations)", () => {
    expect(isCompleteRun(buildRun({ failedImageSet, imageSet: undefined }))).toBe(false);
  });

  test("returns false when the run has no image set at all", () => {
    expect(isCompleteRun(buildRun({ imageSet: undefined }))).toBe(false);
  });
});
