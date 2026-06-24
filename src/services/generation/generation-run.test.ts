import { describe, expect, test } from "vitest";
import {
  buildStubbedGenerationEvents,
  parseCompletedGenerationRunPayload,
  parseJokeContextSnapshot,
  parseSavedGenerationRun,
} from "@/services/generation";
import { buildReplySignals } from "@/services/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import { buildImageSet, buildJokeContextSnapshot, buildUploadedImageSet } from "./test-fixtures";

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

  test("round-trips a run carrying completed and failed Uploaded Image Sets", () => {
    const baseRunningRun = {
      id: "run-uploaded",
      label: "Uploaded sets run",
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
      status: "running" as const,
      draftCount: 0,
      draftTarget: 3 as const,
      drafts: [],
    };

    const parsed = parseSavedGenerationRun({
      ...baseRunningRun,
      uploadedImageSets: [
        { status: "completed", imageSet: buildUploadedImageSet() },
        {
          status: "failed",
          failedImageSet: {
            id: "uploaded-failed-1",
            failedAt: "2026-06-05T11:30:00.000Z",
            message: "Image generation failed for the uploaded image.",
            selectedImageId: "uploaded-original-2",
            debugLog: ["AI Gateway timeout", "step: generate-variations"],
          },
        },
      ],
    });

    expect(parsed.uploadedImageSets).toHaveLength(2);
    expect(parsed.uploadedImageSets[0]).toMatchObject({ status: "completed" });
    expect(parsed.uploadedImageSets[1]).toMatchObject({ status: "failed" });
    // Serialize → re-parse is byte-for-byte stable.
    expect(parseSavedGenerationRun(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  test("defaults uploadedImageSets to an empty list on a legacy payload without the field", () => {
    const parsed = parseSavedGenerationRun({
      id: "run-legacy",
      label: "Legacy run",
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
      status: "running" as const,
      draftCount: 0,
      draftTarget: 3 as const,
      drafts: [],
    });

    expect(parsed.uploadedImageSets).toEqual([]);
    // A run that predates News Category carries none of its fields and still parses.
    expect(parsed.newsCategory).toBeUndefined();
    expect(parsed.newsCategoryClassification).toBeUndefined();
    expect(parsed.newsCategoryColor).toBeUndefined();
  });

  test("round-trips a News Category and its classification result-state in both shapes", () => {
    const baseRunningRun = {
      id: "run-news-category",
      label: "News Category run",
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
      status: "running" as const,
      draftCount: 0,
      draftTarget: 3 as const,
      drafts: [],
    };

    const completed = parseSavedGenerationRun({
      ...baseRunningRun,
      newsCategory: "ACQUIRED",
      newsCategoryClassification: {
        status: "completed",
        startedAt: "2026-06-06T10:10:00.000Z",
        completedAt: "2026-06-06T10:10:05.000Z",
      },
    });

    expect(completed).toMatchObject({
      newsCategory: "ACQUIRED",
      newsCategoryClassification: { status: "completed" },
    });

    const failed = parseSavedGenerationRun({
      ...baseRunningRun,
      // On failure the resolved stamp falls back to VIRAL while the failed state
      // carries the debug log for the Quiet Failure Details surface.
      newsCategory: "VIRAL",
      newsCategoryClassification: {
        status: "failed",
        startedAt: "2026-06-06T10:10:00.000Z",
        failedAt: "2026-06-06T10:10:05.000Z",
        message: "News Category classification failed.",
        debugLog: ["AI Gateway timeout", "step: classify-news-category"],
      },
    });

    expect(failed.newsCategoryClassification).toMatchObject({ status: "failed" });
    // Serialize → re-parse is byte-for-byte stable.
    expect(parseSavedGenerationRun(JSON.parse(JSON.stringify(failed)))).toEqual(failed);
  });

  test("round-trips a custom-word News Category Color and rejects a non-vocabulary one", () => {
    const baseRunningRun = {
      id: "run-band-color",
      label: "Band color run",
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
      status: "running" as const,
      draftCount: 0,
      draftTarget: 3 as const,
      drafts: [],
    };

    // A custom-label run carries the operator's picked color, and it survives a
    // serialize → re-parse round trip through the JSONB payload.
    const colored = parseSavedGenerationRun({
      ...baseRunningRun,
      newsCategory: "ai bubble",
      newsCategoryColor: "DRAMA",
    });
    expect(colored.newsCategoryColor).toBe("DRAMA");
    expect(parseSavedGenerationRun(JSON.parse(JSON.stringify(colored)))).toEqual(colored);

    // A custom-label run with no stored color leaves the field absent — it resolves
    // to the VIRAL color on read.
    const noColor = parseSavedGenerationRun({ ...baseRunningRun, newsCategory: "ai bubble" });
    expect(noColor.newsCategoryColor).toBeUndefined();

    // The color must name one of the ten vocabulary values; a stray string is rejected.
    expect(() =>
      parseSavedGenerationRun({ ...baseRunningRun, newsCategoryColor: "MAUVE" }),
    ).toThrow();
  });

  test("a failed News Category classification never breaks a Complete Run", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const drafts = buildStubbedGenerationEvents({
      replySignals: buildReplySignals(tweetContext),
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
    }).flatMap((event) => (event.type === "progress" ? [event.draft] : []));

    // A completed run with all its creative output, plus a failed classification:
    // classification sits outside the success determination, so the run still
    // parses as a Complete Run with VIRAL as its stamp.
    const parsed = parseSavedGenerationRun({
      id: "run-news-failed",
      label: "Completed run, failed classification",
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
      status: "completed" as const,
      draftCount: 3,
      draftTarget: 3 as const,
      sourceTweet: tweetContext.sourceTweet,
      savedAt: "2026-06-05T10:30:00.000Z",
      drafts,
      newsCategory: "VIRAL",
      newsCategoryClassification: {
        status: "failed",
        startedAt: "2026-06-06T10:10:00.000Z",
        failedAt: "2026-06-06T10:10:05.000Z",
        message: "News Category classification failed.",
      },
    });

    expect(parsed).toMatchObject({
      status: "completed",
      newsCategory: "VIRAL",
      newsCategoryClassification: { status: "failed" },
    });
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

  test("links an automated run to the News Coverage Cluster it was started from", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const drafts = buildStubbedGenerationEvents({
      replySignals: buildReplySignals(tweetContext),
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
    }).flatMap((event) => (event.type === "progress" ? [event.draft] : []));

    expect(
      parseSavedGenerationRun({
        id: "run-1",
        label: "Drafts for 2468",
        sourceTweetUrl: "https://x.com/siliconmania/status/2468",
        usersDirection: "",
        status: "completed" as const,
        origin: "automated" as const,
        imagePromptSource: "default" as const,
        newsCoverageClusterId: "cluster-openai-workspace",
        draftCount: 3,
        draftTarget: 3 as const,
        sourceTweet: tweetContext.sourceTweet,
        savedAt: "2026-06-05T10:30:00.000Z",
        drafts,
      }),
    ).toMatchObject({
      origin: "automated",
      imagePromptSource: "default",
      newsCoverageClusterId: "cluster-openai-workspace",
    });
  });

  test("allows completed runs with failed text generation when another creative branch succeeds", () => {
    const jokeContextSnapshot = parseJokeContextSnapshot(buildJokeContextSnapshot());

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
            completedAt: "2026-06-06T10:10:25.000Z",
            newsLinkedImages: [
              {
                id: "news-linked-image-1",
                url: "https://news.example.com/image-1.jpg",
                altText: "News-linked image 1.",
                sourceUrl: "https://news.example.com/article-1",
                title: "Headline 1",
              },
            ],
            startedAt: "2026-06-06T10:10:02.000Z",
            status: "completed",
          },
          textGeneration: {
            failedAt: "2026-06-06T10:10:30.000Z",
            message: "Text generation could not produce a usable draft set.",
            startedAt: "2026-06-06T10:10:01.000Z",
            status: "failed",
          },
        },
      }),
    ).toMatchObject({
      drafts: [],
      generationResultStates: {
        textGeneration: {
          status: "failed",
        },
        newsLinkedImageDiscovery: {
          status: "completed",
        },
      },
    });
  });
});
