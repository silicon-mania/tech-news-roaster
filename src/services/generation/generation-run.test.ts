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
import {
  buildImageSet,
  buildJokeContextSnapshot,
  buildLegacyVisualJokeSet,
  buildVisualJokeSet,
} from "./test-fixtures";

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

  test("reopens a pre-categorized saved run by gating its legacy Visual Joke Set", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const jokeContextSnapshot = parseJokeContextSnapshot(buildJokeContextSnapshot());
    const legacyVisualJokeSet = buildLegacyVisualJokeSet();
    const drafts = buildStubbedGenerationEvents({
      replySignals: buildReplySignals(tweetContext),
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
    }).flatMap((event) => (event.type === "progress" ? [event.draft] : []));

    const reopened = parseSavedGenerationRun({
      id: "run-legacy",
      label: "Drafts for 2468",
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
      status: "completed",
      draftCount: 3,
      draftTarget: 3,
      sourceTweet: tweetContext.sourceTweet,
      savedAt: "2026-06-05T10:30:00.000Z",
      drafts,
      jokeContextSnapshot,
      // A run persisted under the old shape carries the legacy set both at the
      // top level and inside the completed Visual Joke Generation stage, and the
      // Selected Visual Joke points into it.
      visualJokeSet: legacyVisualJokeSet,
      selectedVisualJoke: {
        selectedAt: "2026-06-05T10:29:00.000Z",
        visualJokeId: "legacy-visual-joke-1",
      },
      generationResultStates: {
        contextGathering: {
          completedAt: "2026-06-06T10:10:00.000Z",
          jokeContextSnapshot,
          startedAt: "2026-06-06T10:08:00.000Z",
          status: "completed",
        },
        imageGeneration: { status: "not-started" },
        newsLinkedImageDiscovery: {
          failedAt: "2026-06-06T10:10:25.000Z",
          message: "No qualifying news-linked images were found.",
          startedAt: "2026-06-06T10:10:02.000Z",
          status: "failed",
        },
        textGeneration: {
          completedAt: "2026-06-06T10:10:30.000Z",
          draftCount: 3,
          startedAt: "2026-06-06T10:10:01.000Z",
          status: "completed",
        },
        visualJokeGeneration: {
          completedAt: "2026-06-06T10:10:40.000Z",
          startedAt: "2026-06-06T10:10:03.000Z",
          status: "completed",
          visualJokeSet: legacyVisualJokeSet,
        },
      },
    });

    // The Visual Joke area is gated to empty, the dependent selection is
    // dropped, and the rest of the run (drafts, text generation) is intact.
    expect(reopened.status).toBe("completed");
    expect(reopened.visualJokeSet).toBeUndefined();
    expect(reopened.selectedVisualJoke).toBeUndefined();
    expect(reopened.drafts).toHaveLength(3);
    expect(reopened.generationResultStates?.visualJokeGeneration.status).toBe("not-started");
    expect(reopened.generationResultStates?.textGeneration.status).toBe("completed");
  });

  test("reopens a legacy run whose only creative success was its gated Visual Jokes as failed", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/9999");
    const jokeContextSnapshot = parseJokeContextSnapshot(buildJokeContextSnapshot());
    const legacyVisualJokeSet = buildLegacyVisualJokeSet();

    const reopened = parseSavedGenerationRun({
      id: "run-legacy-sole-success",
      label: "Drafts for 9999",
      sourceTweetUrl: "https://x.com/siliconmania/status/9999",
      usersDirection: "",
      status: "completed",
      draftCount: 0,
      draftTarget: 3,
      sourceTweet: tweetContext.sourceTweet,
      savedAt: "2026-06-05T10:30:00.000Z",
      drafts: [],
      jokeContextSnapshot,
      visualJokeSet: legacyVisualJokeSet,
      generationResultStates: {
        contextGathering: {
          completedAt: "2026-06-06T10:10:00.000Z",
          jokeContextSnapshot,
          startedAt: "2026-06-06T10:08:00.000Z",
          status: "completed",
        },
        imageGeneration: { status: "not-started" },
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
          visualJokeSet: legacyVisualJokeSet,
        },
      },
    });

    // Gating the sole creative success would break the completed-run invariant,
    // so the run reopens as failed rather than throwing.
    expect(reopened.status).toBe("failed");
    expect(reopened.visualJokeSet).toBeUndefined();
    expect(reopened.failureMessage).toBeDefined();
  });

  test("round-trips a categorized saved run untouched by the back-compat gate", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());
    const drafts = buildStubbedGenerationEvents({
      replySignals: buildReplySignals(tweetContext),
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
    }).flatMap((event) => (event.type === "progress" ? [event.draft] : []));

    const reopened = parseSavedGenerationRun({
      id: "run-categorized",
      label: "Drafts for 2468",
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "",
      status: "completed",
      draftCount: 3,
      draftTarget: 3,
      sourceTweet: tweetContext.sourceTweet,
      savedAt: "2026-06-05T10:30:00.000Z",
      drafts,
      visualJokeSet,
      selectedVisualJoke: {
        selectedAt: "2026-06-05T10:29:00.000Z",
        visualJokeId: visualJokeSet.jokes[0].id,
      },
    });

    expect(reopened.visualJokeSet).toEqual(visualJokeSet);
    expect(reopened.selectedVisualJoke?.visualJokeId).toBe(visualJokeSet.jokes[0].id);
  });
});
