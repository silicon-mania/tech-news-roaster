import { describe, expect, test } from "vitest";
import { buildCompletedV3Run } from "../workspace/workspace-test-utils";
import { resolveRunCardContent } from "./resolve-run-card-content";

describe("resolveRunCardContent", () => {
  test("uses the operator's explicit picks when present", () => {
    const run = buildCompletedV3Run({
      selectedDraftId: "draft-anthropic",
      selectedGeneratedImage: {
        imageOptionId: "image-option-news-linked-image-1-variation-2",
        selectedAt: "2026-06-06T10:18:00.000Z",
      },
    });

    const { draft, variation } = resolveRunCardContent(run);

    expect(draft?.id).toBe("draft-anthropic");
    expect(variation?.id).toBe("image-option-news-linked-image-1-variation-2");
  });

  test("falls back to the first draft and first variation with no selection", () => {
    const run = buildCompletedV3Run({
      selectedDraftId: undefined,
      selectedGeneratedImage: null,
    });

    const { draft, variation } = resolveRunCardContent(run);

    // First-of-each, matching Automated Selection — no joke slot is resolved.
    expect(draft?.id).toBe("draft-openai");
    expect(variation?.id).toBe("image-option-news-linked-image-1-variation-1");
  });

  test("falls back to the first variation when an explicit image selection dangles past its content", () => {
    const run = buildCompletedV3Run({
      selectedGeneratedImage: {
        imageOptionId: "image-option-missing",
        selectedAt: "2026-06-06T10:16:00.000Z",
      },
    });

    expect(resolveRunCardContent(run).variation?.id).toBe(
      "image-option-news-linked-image-1-variation-1",
    );
  });

  test("returns the run's embedded Source Tweet", () => {
    expect(resolveRunCardContent(buildCompletedV3Run()).sourceTweet?.author.username).toBe(
      "siliconmania",
    );
  });
});
