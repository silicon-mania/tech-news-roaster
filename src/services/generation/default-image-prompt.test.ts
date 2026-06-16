import { describe, expect, test } from "vitest";
import { defaultImagePrompt, parseImageGenerationInput } from "@/services/generation";

describe("defaultImagePrompt", () => {
  test("is a non-empty prompt an automated run can feed straight into Image Generation", () => {
    expect(defaultImagePrompt.trim().length).toBeGreaterThan(0);

    // It must satisfy the same contract as a User Image Prompt so it can flow
    // through Image Generation unchanged (the wording itself is tuned in 021).
    expect(() =>
      parseImageGenerationInput({
        parentRunId: "run-automated-1",
        selectedImageId: "source-tweet-media-candidate-1",
        userImagePrompt: defaultImagePrompt,
      }),
    ).not.toThrow();
  });
});
