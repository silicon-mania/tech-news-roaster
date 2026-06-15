import { describe, expect, test } from "vitest";
import type { GenerationProviderId } from "@/services/generation";
import { planSavedRunRetention } from "./saved-runs-store";
import type { GenerationRun } from "./types";

describe("planSavedRunRetention", () => {
  test("keeps the ten latest successful saved runs without counting running or failed runs", () => {
    const successfulRuns = Array.from({ length: 11 }, (_, index) =>
      buildRun({
        id: `successful-run-${index + 1}`,
        savedAt: timestamp(index + 1),
      }),
    );
    const runningRun = buildRun({
      id: "running-run",
      savedAt: timestamp(0),
      status: "running",
    });
    const failedRun = buildRun({
      failureMessage: "Source tweet unavailable.",
      id: "failed-run",
      savedAt: timestamp(0),
      status: "failed",
    });

    const { deletedRunIds, retainedRuns } = planSavedRunRetention([
      ...successfulRuns,
      runningRun,
      failedRun,
    ]);

    expect([...deletedRunIds]).toEqual(["successful-run-1"]);
    expect(retainedRuns.map((run) => run.id)).toEqual([
      "successful-run-2",
      "successful-run-3",
      "successful-run-4",
      "successful-run-5",
      "successful-run-6",
      "successful-run-7",
      "successful-run-8",
      "successful-run-9",
      "successful-run-10",
      "successful-run-11",
      "running-run",
      "failed-run",
    ]);
  });

  test("deletes whole old saved runs while preserving retained draft edits and image sets", () => {
    const oldImageSet = buildImageSet("old-image-set");
    const retainedImageSet = buildImageSet("retained-image-set");
    const oldRun = buildRun({
      drafts: [
        buildSavedDraft({
          id: "old-edited-draft",
          provider: "openai",
          text: "Old edited draft.",
        }),
      ],
      id: "old-image-heavy-run",
      imageGenerationState: {
        completedAt: timestamp(1),
        selectedImageId: "old-news-image",
        startedAt: timestamp(1),
        status: "completed",
        userImagePrompt: "Make the old visual sharper.",
      },
      imageSet: oldImageSet,
      newsLinkedImages: [
        {
          id: "old-news-image",
          title: "Old news image",
          url: "https://example.com/old-news-image.png",
        },
      ],
      savedAt: timestamp(1),
      selectedImageOriginal: oldImageSet.selectedImageOriginal,
    });
    const retainedRun = buildRun({
      drafts: [
        buildSavedDraft({
          id: "retained-edited-draft",
          provider: "openai",
          text: "Retained edited draft.",
        }),
      ],
      id: "retained-image-heavy-run",
      imageGenerationState: {
        completedAt: timestamp(12),
        selectedImageId: "retained-news-image",
        startedAt: timestamp(12),
        status: "completed",
        userImagePrompt: "Make the retained visual sharper.",
      },
      imageSet: retainedImageSet,
      newsLinkedImages: [
        {
          id: "retained-news-image",
          title: "Retained news image",
          url: "https://example.com/retained-news-image.png",
        },
      ],
      savedAt: timestamp(12),
      selectedImageOriginal: retainedImageSet.selectedImageOriginal,
    });
    const fillerRuns = Array.from({ length: 9 }, (_, index) =>
      buildRun({
        id: `filler-run-${index + 1}`,
        savedAt: timestamp(index + 2),
      }),
    );

    const { deletedRunIds, retainedRuns } = planSavedRunRetention([
      oldRun,
      ...fillerRuns,
      retainedRun,
    ]);
    const retainedIds = new Set(retainedRuns.map((run) => run.id));
    const persistedRetainedRun = retainedRuns.find((run) => run.id === "retained-image-heavy-run");

    expect([...deletedRunIds]).toEqual(["old-image-heavy-run"]);
    expect(retainedIds.has("old-image-heavy-run")).toBe(false);
    expect(persistedRetainedRun?.drafts[0]?.text).toBe("Retained edited draft.");
    expect(persistedRetainedRun?.imageSet).toEqual(retainedImageSet);
    expect(persistedRetainedRun?.selectedImageOriginal).toEqual(
      retainedImageSet.selectedImageOriginal,
    );
    expect(persistedRetainedRun?.newsLinkedImages).toEqual([
      {
        id: "retained-news-image",
        title: "Retained news image",
        url: "https://example.com/retained-news-image.png",
      },
    ]);
  });
});

function buildRun(overrides: Partial<GenerationRun> = {}): GenerationRun {
  return {
    id: "saved-run",
    label: "Saved run",
    sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
    usersDirection: "Keep it dry.",
    status: "completed",
    draftCount: 3,
    draftTarget: 3,
    drafts: [
      buildSavedDraft({
        id: "draft-openai",
        provider: "openai",
        text: "Quote-tweet draft: first saved draft.",
      }),
      buildSavedDraft({
        id: "draft-anthropic",
        provider: "anthropic",
        text: "Quote-tweet draft: second saved draft.",
      }),
      buildSavedDraft({
        id: "draft-google",
        provider: "google",
        text: "Quote-tweet draft: third saved draft.",
      }),
    ],
    savedAt: timestamp(1),
    ...overrides,
  };
}

function buildSavedDraft({
  id,
  provider,
  text,
}: {
  id: string;
  provider: GenerationProviderId;
  text: string;
}): GenerationRun["drafts"][number] {
  return {
    angle: `${provider} angle`,
    id,
    modelProvenance: `${provider} local draft model`,
    provider,
    text,
    visibleRationale: `${provider} rationale.`,
  };
}

function buildImageSet(id: string): NonNullable<GenerationRun["imageSet"]> {
  const selectedImageOriginal = {
    id: `${id}-selected-original`,
    candidateId: `${id}-candidate`,
    origin: "news-linked-image" as const,
    preparedAt: timestamp(1),
    title: `${id} selected original`,
    url: `https://example.com/${id}-selected-original.png`,
  };

  return {
    completedAt: timestamp(1),
    id,
    imageModelProvenance: {
      model: "local image model",
    },
    options: [
      {
        id: `${id}-original`,
        kind: "original",
        label: "Original",
        url: `https://example.com/${id}-original.png`,
      },
      {
        id: `${id}-variation-1`,
        kind: "variation",
        label: "Variation 1",
        url: `https://example.com/${id}-variation-1.png`,
      },
      {
        id: `${id}-variation-2`,
        kind: "variation",
        label: "Variation 2",
        url: `https://example.com/${id}-variation-2.png`,
      },
      {
        id: `${id}-variation-3`,
        kind: "variation",
        label: "Variation 3",
        url: `https://example.com/${id}-variation-3.png`,
      },
      {
        id: `${id}-variation-4`,
        kind: "variation",
        label: "Variation 4",
        url: `https://example.com/${id}-variation-4.png`,
      },
    ],
    selectedImageOriginal,
  };
}

function timestamp(day: number) {
  return new Date(Date.UTC(2026, 0, day)).toISOString();
}
