import { describe, expect, test } from "vitest";
import {
  buildStubbedGenerationEvents,
  parseCompletedGenerationRunPayload,
  parseJokeContextSnapshot,
  parseSavedGenerationRun,
  parseVisualJokeSet,
} from "@/services/generation";
import { buildReplySignals } from "@/services/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import { buildImageSet, buildJokeContextSnapshot, buildVisualJokeSet } from "./test-fixtures";

describe("generation run contracts", () => {
  test("rejects completed runs without exactly three drafts", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    expect(() =>
      parseCompletedGenerationRunPayload({
        label: "Incomplete run",
        sourceTweet: tweetContext.sourceTweet,
        drafts: [
          {
            angle: "incomplete",
            id: "one",
            text: "Quote-tweet draft: One draft is not a completed comparison.",
            modelProvenance: "local draft model",
            provider: "openai",
            visibleRationale: "This should still fail because it is alone.",
          },
        ],
      }),
    ).toThrow();
  });

  test("validates v2 saved runs and rejects invalid one-time image states", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const imageSet = buildImageSet();

    expect(
      parseSavedGenerationRun({
        id: "run-1",
        label: "Drafts for 2468",
        sourceTweetUrl: "https://x.com/siliconmania/status/2468",
        usersDirection: "Keep it skeptical.",
        status: "completed",
        phase: "image-generation-complete",
        draftCount: 3,
        draftTarget: 3,
        sourceTweet: tweetContext.sourceTweet,
        savedAt: "2026-06-05T10:30:00.000Z",
        drafts: buildStubbedGenerationEvents({
          replySignals: buildReplySignals(tweetContext),
          sourceTweet: tweetContext.sourceTweet,
          sourceTweetUrl: "https://x.com/siliconmania/status/2468",
          usersDirection: "Keep it skeptical.",
        }).flatMap((event) => (event.type === "progress" ? [event.draft] : [])),
        imageGenerationState: {
          status: "completed",
          selectedImageId: "news-linked-image-1",
          userImagePrompt: "Make it brighter.",
          startedAt: "2026-06-05T10:20:00.000Z",
          completedAt: "2026-06-05T10:25:00.000Z",
        },
        imageModelProvenance: {
          model: "image-model-v1",
          provider: "ai-gateway",
        },
        imageSet,
        selectedImageOriginal: imageSet.selectedImageOriginal,
      }),
    ).toMatchObject({
      id: "run-1",
      imageGenerationState: {
        status: "completed",
      },
    });
    expect(() =>
      parseSavedGenerationRun({
        id: "run-1",
        label: "Drafts for 2468",
        sourceTweetUrl: "https://x.com/siliconmania/status/2468",
        usersDirection: "",
        status: "completed",
        draftCount: 3,
        draftTarget: 3,
        drafts: [],
        imageGenerationState: {
          status: "retryable",
        },
      }),
    ).toThrow();
  });

  test("accepts a Selected Draft id that names one of the run's drafts and rejects a stray one", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const drafts = buildStubbedGenerationEvents({
      replySignals: buildReplySignals(tweetContext),
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
    }).flatMap((event) => (event.type === "progress" ? [event.draft] : []));
    const baseSavedRun = {
      id: "run-1",
      label: "Drafts for 2468",
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
      status: "completed" as const,
      draftCount: 3,
      draftTarget: 3 as const,
      sourceTweet: tweetContext.sourceTweet,
      savedAt: "2026-06-05T10:30:00.000Z",
      drafts,
    };

    expect(
      parseSavedGenerationRun({ ...baseSavedRun, selectedDraftId: drafts[1].id }),
    ).toMatchObject({
      selectedDraftId: drafts[1].id,
    });
    expect(() =>
      parseSavedGenerationRun({ ...baseSavedRun, selectedDraftId: "draft-that-does-not-exist" }),
    ).toThrow();
  });

  test("allows completed runs with failed text generation when another creative branch succeeds", () => {
    const jokeContextSnapshot = parseJokeContextSnapshot(buildJokeContextSnapshot());
    const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());

    expect(
      parseCompletedGenerationRunPayload({
        label: "Drafts for 9999",
        sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/9999").sourceTweet,
        drafts: [],
        jokeContextSnapshot,
        generationResultStates: {
          contextGathering: {
            completedAt: "2026-06-06T10:10:00.000Z",
            jokeContextSnapshot,
            startedAt: "2026-06-06T10:08:00.000Z",
            status: "completed",
          },
          imageGeneration: {
            status: "not-started",
          },
          newsLinkedImageDiscovery: {
            failedAt: "2026-06-06T10:10:25.000Z",
            message: "No qualifying news-linked images were found.",
            startedAt: "2026-06-06T10:10:02.000Z",
            status: "failed",
          },
          textGeneration: {
            failedAt: "2026-06-06T10:10:30.000Z",
            message: "Text generation could not produce a usable draft set.",
            startedAt: "2026-06-06T10:10:01.000Z",
            status: "failed",
          },
          visualJokeGeneration: {
            completedAt: "2026-06-06T10:10:40.000Z",
            startedAt: "2026-06-06T10:10:03.000Z",
            status: "completed",
            visualJokeSet,
          },
        },
        visualJokeSet,
      }),
    ).toMatchObject({
      drafts: [],
      generationResultStates: {
        textGeneration: {
          status: "failed",
        },
        visualJokeGeneration: {
          status: "completed",
        },
      },
    });
  });
});
