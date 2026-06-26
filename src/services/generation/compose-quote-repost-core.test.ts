import { describe, expect, test, vi } from "vitest";
import {
  type NewsCategory,
  parseCompletedGenerationRunPayload,
  parseJokeContextSnapshot,
} from "@/services/generation";
import { buildJokeContextSnapshot } from "@/services/generation/test-fixtures";
import { JokeContextGatheringError } from "@/services/joke-context-gathering";
import type { NewsCategoryClassificationResult } from "@/services/news-category-classifier";
import { buildFixtureTweetContext, TweetRetrievalError } from "@/services/tweet-retrieval";
import {
  type ComposeQuoteRepostCoreComposed,
  type ComposeQuoteRepostCoreOptions,
  type ComposeQuoteRepostCoreResult,
  composeQuoteRepostCore,
} from "./compose-quote-repost-core";

const fixedNow = () => new Date("2026-06-16T12:00:00.000Z");
const sourceTweetUrl = "https://x.com/siliconmania/status/1234";
// The first Image Original Candidate the fixture Source Tweet yields (its first
// usable image), assembled ahead of any News-Linked Image.
const firstCandidateId = "source-tweet-media-candidate-fixture-media-1";

const jokeContextSnapshot = parseJokeContextSnapshot(buildJokeContextSnapshot());

/** A happy-path classification result — a vocabulary pick plus its completed state. */
function buildClassificationResult(
  newsCategory: NewsCategory = "ACQUIRED",
): NewsCategoryClassificationResult {
  return {
    classification: {
      completedAt: "2026-06-16T12:00:01.000Z",
      startedAt: "2026-06-16T12:00:00.000Z",
      status: "completed",
    },
    newsCategory,
  };
}

/** A failed classification result — the VIRAL fallback plus a persisted failed state. */
function buildFailedClassificationResult(): NewsCategoryClassificationResult {
  return {
    classification: {
      debugLog: [
        "Classifying News Category via test.",
        "Classification failed and the stamp fell back to VIRAL: Classifier timed out.",
      ],
      failedAt: "2026-06-16T12:00:01.000Z",
      message: "Classifier timed out.",
      startedAt: "2026-06-16T12:00:00.000Z",
      status: "failed",
    },
    newsCategory: "VIRAL",
  };
}

function buildNewsLinkedImages() {
  return [
    {
      id: "news-linked-image-1",
      url: "https://example.com/news-linked-image.jpg",
      altText: "News-linked image candidate.",
      sourceUrl: "https://example.com/report",
      title: "News-linked product image",
    },
  ];
}

function buildCompletedPayload(options: { fallbackDisclosure?: string } = {}) {
  const sourceTweet = buildFixtureTweetContext(sourceTweetUrl).sourceTweet;

  return parseCompletedGenerationRunPayload({
    label: "Automated drafts",
    sourceTweet,
    drafts: [
      {
        id: "draft-openai",
        angle: "platform leverage",
        text: "First automated draft.",
        modelProvenance: "local draft model",
        provider: "openai",
        visibleRationale: "Leads on platform leverage.",
      },
      {
        id: "draft-anthropic",
        angle: "incentive shift",
        text: "Second automated draft.",
        modelProvenance: "local draft model",
        provider: "anthropic",
        visibleRationale: "Leans on incentives.",
      },
      {
        id: "draft-google",
        angle: "distribution bet",
        text: "Third automated draft.",
        modelProvenance: "local draft model",
        provider: "google",
        visibleRationale: "Treats it as a distribution bet.",
      },
    ],
    generationResultStates: {
      contextGathering: {
        status: "completed",
        startedAt: "2026-06-06T10:08:00.000Z",
        completedAt: "2026-06-06T10:10:00.000Z",
        jokeContextSnapshot,
      },
      textGeneration: {
        status: "completed",
        startedAt: "2026-06-06T10:10:01.000Z",
        completedAt: "2026-06-06T10:10:30.000Z",
        draftCount: 3,
      },
      newsLinkedImageDiscovery: { status: "not-started" },
      imageGeneration: { status: "not-started" },
    },
    ...(options.fallbackDisclosure ? { fallbackDisclosure: options.fallbackDisclosure } : {}),
  });
}

function buildOptions(
  overrides: Partial<ComposeQuoteRepostCoreOptions> = {},
): ComposeQuoteRepostCoreOptions {
  return {
    runKind: "automated",
    retrieveTweetContext: async ({ sourceTweetUrl: requestedUrl }) =>
      buildFixtureTweetContext(requestedUrl),
    gatherJokeContext: async () => jokeContextSnapshot,
    discoverNewsLinkedImages: async () => ({
      discoveredAt: "2026-06-05T10:20:00.000Z",
      newsLinkedImages: buildNewsLinkedImages(),
    }),
    orchestrateGeneration: async () => buildCompletedPayload(),
    classifyNewsCategory: async () => buildClassificationResult(),
    now: fixedNow,
    ...overrides,
  };
}

function expectComposed(result: ComposeQuoteRepostCoreResult): ComposeQuoteRepostCoreComposed {
  if (result.status !== "composed") {
    throw new Error(`Expected a composed result, got failed at stage ${result.stage}.`);
  }

  return result;
}

describe("composeQuoteRepostCore", () => {
  test("composes the building blocks through Image Original Candidates on the happy path", async () => {
    const composed = expectComposed(
      await composeQuoteRepostCore({ sourceTweetUrl, usersDirection: "" }, buildOptions()),
    );

    // The pipeline's outputs ride back to the caller: source tweet, snapshot, drafts,
    // the orchestrator's label, the classification stamp, and the assembled candidates.
    expect(composed.sourceTweet).toBeDefined();
    expect(composed.jokeContextSnapshot).toEqual(jokeContextSnapshot);
    expect(composed.orchestratorLabel).toBe("Automated drafts");
    expect(composed.drafts.map((draft) => draft.id)).toEqual([
      "draft-openai",
      "draft-anthropic",
      "draft-google",
    ]);
    expect(composed.newsCategory).toBe("ACQUIRED");
    expect(composed.newsCategoryClassification.status).toBe("completed");

    // Source Tweet media leads the candidates; the News-Linked Image rides too.
    expect(composed.imageOriginalCandidates[0]?.id).toBe(firstCandidateId);
    expect(composed.newsLinkedImages).toHaveLength(1);

    // The three creative-area states are completed; imageGeneration is the caller's
    // concern and is deliberately absent here.
    expect(composed.creativeResultStates.contextGathering.status).toBe("completed");
    expect(composed.creativeResultStates.textGeneration.status).toBe("completed");
    expect(composed.creativeResultStates.newsLinkedImageDiscovery.status).toBe("completed");
    expect("imageGeneration" in composed.creativeResultStates).toBe(false);
  });

  test("threads the user's direction and the billing run kind to the metered services", async () => {
    const orchestrateGeneration = vi.fn(async () => buildCompletedPayload());
    const classifyNewsCategory = vi.fn(async () => buildClassificationResult());

    await composeQuoteRepostCore(
      { sourceTweetUrl, usersDirection: "lean cynical" },
      buildOptions({ runKind: "manual", orchestrateGeneration, classifyNewsCategory }),
    );

    // Direction reaches Text Generation only, and the run kind bills the caller's key
    // on both the orchestrator and the classifier.
    expect(orchestrateGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ sourceTweetUrl, usersDirection: "lean cynical" }),
      { runKind: "manual" },
    );
    expect(classifyNewsCategory).toHaveBeenCalledWith(
      { jokeContextSnapshot },
      expect.objectContaining({ runKind: "manual" }),
    );
  });

  test("preserves the orchestrator's Provider Fallback disclosure", async () => {
    const fallbackDisclosure =
      "Provider fallback used for Anthropic; duplicate model provenance is shown on affected drafts.";

    const composed = expectComposed(
      await composeQuoteRepostCore(
        { sourceTweetUrl, usersDirection: "" },
        buildOptions({
          orchestrateGeneration: async () => buildCompletedPayload({ fallbackDisclosure }),
        }),
      ),
    );

    expect(composed.fallbackDisclosure).toBe(fallbackDisclosure);
  });

  test("falls back to VIRAL on a classifier failure without failing composition", async () => {
    const composed = expectComposed(
      await composeQuoteRepostCore(
        { sourceTweetUrl, usersDirection: "" },
        buildOptions({ classifyNewsCategory: async () => buildFailedClassificationResult() }),
      ),
    );

    // The classifier is not a creative area: composition still succeeds with all
    // drafts, and the failed classification state rides along for the ghost icon.
    expect(composed.newsCategory).toBe("VIRAL");
    expect(composed.newsCategoryClassification).toMatchObject({
      message: "Classifier timed out.",
      status: "failed",
    });
    expect(composed.drafts).toHaveLength(3);
  });

  test("captures a News-Linked Image Discovery failure without failing composition", async () => {
    const composed = expectComposed(
      await composeQuoteRepostCore(
        { sourceTweetUrl, usersDirection: "" },
        buildOptions({
          discoverNewsLinkedImages: async () => ({
            discoveredAt: "2026-06-05T10:20:00.000Z",
            newsLinkedImages: [],
          }),
        }),
      ),
    );

    // Discovery yielded nothing: no News-Linked Images, its state is failed, but the
    // run still composes from Source Tweet media alone.
    expect(composed.newsLinkedImages).toEqual([]);
    expect(composed.creativeResultStates.newsLinkedImageDiscovery.status).toBe("failed");
    expect(composed.imageOriginalCandidates[0]?.id).toBe(firstCandidateId);
  });

  test("classifies in parallel with the creative branches and never blocks composition", async () => {
    let markOrchestrationStarted!: () => void;
    let markDiscoveryStarted!: () => void;
    const orchestrationStarted = new Promise<void>((resolve) => {
      markOrchestrationStarted = resolve;
    });
    const discoveryStarted = new Promise<void>((resolve) => {
      markDiscoveryStarted = resolve;
    });

    // The classifier settles only once BOTH creative branches have begun, so if the
    // core awaited it before kicking them off, this would deadlock and time out.
    const classifyNewsCategory = vi.fn(async (): Promise<NewsCategoryClassificationResult> => {
      await Promise.all([orchestrationStarted, discoveryStarted]);

      return buildClassificationResult("DROPPED");
    });
    const orchestrateGeneration = vi.fn(async () => {
      markOrchestrationStarted();

      return buildCompletedPayload();
    });
    const discoverNewsLinkedImages = vi.fn(async () => {
      markDiscoveryStarted();

      return {
        discoveredAt: "2026-06-05T10:20:00.000Z",
        newsLinkedImages: buildNewsLinkedImages(),
      };
    });

    const composed = expectComposed(
      await composeQuoteRepostCore(
        { sourceTweetUrl, usersDirection: "" },
        buildOptions({ classifyNewsCategory, discoverNewsLinkedImages, orchestrateGeneration }),
      ),
    );

    expect(classifyNewsCategory).toHaveBeenCalledTimes(1);
    expect(composed.newsCategory).toBe("DROPPED");
    expect(composed.drafts).toHaveLength(3);
  });

  test("fails at the tweet-retrieval stage and attempts nothing downstream", async () => {
    const gatherJokeContext = vi.fn();
    const result = await composeQuoteRepostCore(
      { sourceTweetUrl, usersDirection: "" },
      buildOptions({
        retrieveTweetContext: async () => {
          throw new TweetRetrievalError();
        },
        gatherJokeContext,
      }),
    );

    expect(result).toEqual({
      status: "failed",
      stage: "tweet-retrieval",
      failureMessage: "Source tweet could not be retrieved.",
    });
    expect(gatherJokeContext).not.toHaveBeenCalled();
  });

  test("fails at the joke-context stage with Quiet Failure Details and starts no creative branch", async () => {
    const orchestrateGeneration = vi.fn();
    const discoverNewsLinkedImages = vi.fn();
    const classifyNewsCategory = vi.fn();
    const result = await composeQuoteRepostCore(
      { sourceTweetUrl, usersDirection: "" },
      buildOptions({
        gatherJokeContext: async () => {
          throw new JokeContextGatheringError(
            "Joke context gathering could not form usable context.",
            ["Started fixture context gathering.", "Tweet text was too thin."],
          );
        },
        orchestrateGeneration,
        discoverNewsLinkedImages,
        classifyNewsCategory,
      }),
    );

    if (result.status !== "failed" || result.stage !== "joke-context") {
      throw new Error("Expected a joke-context failure.");
    }

    expect(result.failureMessage).toBe("Joke context gathering could not form usable context.");
    expect(result.sourceTweet).toBeDefined();
    expect(result.creativeResultStates.contextGathering).toMatchObject({
      status: "failed",
      debugLog: ["Started fixture context gathering.", "Tweet text was too thin."],
    });
    expect(result.creativeResultStates.textGeneration.status).toBe("not-started");
    expect(result.creativeResultStates.newsLinkedImageDiscovery.status).toBe("not-started");

    // No creative branch starts once context gathering fails (No Automatic Retry).
    expect(orchestrateGeneration).not.toHaveBeenCalled();
    expect(discoverNewsLinkedImages).not.toHaveBeenCalled();
    expect(classifyNewsCategory).not.toHaveBeenCalled();
  });
});
