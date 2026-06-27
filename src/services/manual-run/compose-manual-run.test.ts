import { describe, expect, test, vi } from "vitest";
import {
  type NewsCategory,
  parseCompletedGenerationRunPayload,
  parseJokeContextSnapshot,
} from "@/services/generation";
import { buildJokeContextSnapshot } from "@/services/generation/test-fixtures";
import { JokeContextGatheringError } from "@/services/joke-context-gathering";
import type {
  NewsCategoryClassificationResult,
  NewsCategoryClassifierInput,
} from "@/services/news-category-classifier";
import { createInMemoryRunRepository } from "@/services/saved-runs/in-memory-run-repository";
import { buildFixtureTweetContext, TweetRetrievalError } from "@/services/tweet-retrieval";
import { type ComposeManualRunDependencies, composeManualRun } from "./compose-manual-run";

const fixedNow = () => new Date("2026-06-16T12:00:00.000Z");
const sourceTweetUrl = "https://x.com/siliconmania/status/1234";
const usersDirection = "lean cynical";
const runId = "run-manual-test";
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
    label: "Manual drafts",
    sourceTweet,
    drafts: [
      {
        id: "draft-openai",
        angle: "platform leverage",
        text: "First manual draft.",
        modelProvenance: "local draft model",
        provider: "openai",
        visibleRationale: "Leads on platform leverage.",
      },
      {
        id: "draft-anthropic",
        angle: "incentive shift",
        text: "Second manual draft.",
        modelProvenance: "local draft model",
        provider: "anthropic",
        visibleRationale: "Leans on incentives.",
      },
      {
        id: "draft-google",
        angle: "distribution bet",
        text: "Third manual draft.",
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

function buildDeps(overrides: Partial<ComposeManualRunDependencies> = {}) {
  const repository = createInMemoryRunRepository("operator-account", new Map());
  const deps: ComposeManualRunDependencies = {
    retrieveTweetContext: async ({ sourceTweetUrl: requestedUrl }) =>
      buildFixtureTweetContext(requestedUrl),
    gatherJokeContext: async () => jokeContextSnapshot,
    discoverNewsLinkedImages: async () => ({
      discoveredAt: "2026-06-05T10:20:00.000Z",
      newsLinkedImages: buildNewsLinkedImages(),
    }),
    orchestrateGeneration: async () => buildCompletedPayload(),
    classifyNewsCategory: async () => buildClassificationResult(),
    resolveRepository: async () => ({ repository }),
    now: fixedNow,
    ...overrides,
  };

  return { deps, repository };
}

function expectRun(result: Awaited<ReturnType<typeof composeManualRun>>) {
  if ("unauthorized" in result) {
    throw new Error("Expected a composed run, got unauthorized.");
  }

  return result.run;
}

describe("composeManualRun", () => {
  test("composes a Manual Run through Image Original Candidates and persists it under the operator", async () => {
    const { deps, repository } = buildDeps();

    const run = expectRun(await composeManualRun({ runId, sourceTweetUrl, usersDirection }, deps));

    // Manual provenance: manual origin, User Image Prompt source, the client-minted
    // run id, the operator's direction threaded through, unseen.
    expect(run.id).toBe(runId);
    expect(run.origin).toBe("manual");
    expect(run.imagePromptSource).toBe("user");
    expect(run.usersDirection).toBe(usersDirection);
    expect(run.seenAt).toBeUndefined();
    expect(run.status).toBe("completed");
    expect(run.newsCoverageClusterId).toBeUndefined();

    // The building blocks ride back: drafts, the classification stamp, the candidates.
    expect(run.drafts.map((draft) => draft.id)).toEqual([
      "draft-openai",
      "draft-anthropic",
      "draft-google",
    ]);
    expect(run.newsCategory).toBe("ACQUIRED");
    expect(run.imageOriginalCandidates?.[0]?.id).toBe(firstCandidateId);
    expect(run.newsLinkedImages).toHaveLength(1);

    // No inline Image Generation and no Automated Selection: the operator does both
    // later. The run waits for the operator to pick an image.
    expect(run.imageSet).toBeUndefined();
    expect(run.failedImageSet).toBeUndefined();
    expect(run.imageModelProvenance).toBeUndefined();
    expect(run.imageGenerationState).toEqual({ status: "not-started" });
    expect(run.selectedDraftId).toBeUndefined();
    expect(run.selectedGeneratedImage).toBeUndefined();
    expect(run.selectedImageOriginal).toBeUndefined();
    expect(run.phase).toBe("waiting-for-image-selection");

    // It is the run persisted in the operator's repository.
    const persisted = await repository.loadById(run.id);
    expect(persisted).toEqual(run);
    expect(await repository.list()).toHaveLength(1);
  });

  test("threads the user's direction and bills the manual key on the metered services", async () => {
    const orchestrateGeneration = vi.fn(async () => buildCompletedPayload());
    const classifyNewsCategory = vi.fn(
      async (_input: NewsCategoryClassifierInput): Promise<NewsCategoryClassificationResult> =>
        buildClassificationResult(),
    );
    const { deps } = buildDeps({ orchestrateGeneration, classifyNewsCategory });

    await composeManualRun({ runId, sourceTweetUrl, usersDirection }, deps);

    // Direction reaches Text Generation, and run-kind manual bills the shared key on
    // both the orchestrator and the classifier.
    expect(orchestrateGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ sourceTweetUrl, usersDirection }),
      { runKind: "manual" },
    );
    expect(classifyNewsCategory).toHaveBeenCalledWith(
      { jokeContextSnapshot },
      expect.objectContaining({ runKind: "manual" }),
    );
  });

  test("mints a run id server-side when the caller supplies none", async () => {
    const { deps } = buildDeps({ createRunId: () => "run-server-minted" });

    const run = expectRun(await composeManualRun({ sourceTweetUrl, usersDirection: "" }, deps));

    expect(run.id).toBe("run-server-minted");
    expect(run.usersDirection).toBe("");
  });

  test("preserves the orchestrator's Provider Fallback disclosure unchanged", async () => {
    const fallbackDisclosure =
      "Provider fallback used for Anthropic; duplicate model provenance is shown on affected drafts.";
    const { deps } = buildDeps({
      orchestrateGeneration: async () => buildCompletedPayload({ fallbackDisclosure }),
    });

    const run = expectRun(await composeManualRun({ runId, sourceTweetUrl, usersDirection }, deps));

    expect(run.fallbackDisclosure).toBe(fallbackDisclosure);
  });

  test("persists a failed classification and falls back to VIRAL, leaving the run Complete", async () => {
    const { deps, repository } = buildDeps({
      classifyNewsCategory: async () => buildFailedClassificationResult(),
    });

    const run = expectRun(await composeManualRun({ runId, sourceTweetUrl, usersDirection }, deps));

    // The classifier is not a Creative Result Area: the run stays Complete, with the
    // failed classification persisted for the ghost icon + Quiet Failure Details.
    expect(run.newsCategory).toBe("VIRAL");
    expect(run.newsCategoryClassification).toMatchObject({
      message: "Classifier timed out.",
      status: "failed",
    });
    expect(run.status).toBe("completed");
    expect((await repository.loadById(run.id))?.newsCategory).toBe("VIRAL");
  });

  test("persists a failed run when source tweet retrieval fails, attempting nothing downstream", async () => {
    const gatherJokeContext = vi.fn();
    const { deps, repository } = buildDeps({
      retrieveTweetContext: async () => {
        throw new TweetRetrievalError();
      },
      gatherJokeContext,
    });

    const run = expectRun(await composeManualRun({ runId, sourceTweetUrl, usersDirection }, deps));

    expect(run.status).toBe("failed");
    expect(run.origin).toBe("manual");
    expect(run.imagePromptSource).toBe("user");
    expect(run.failureMessage).toBe("Source tweet could not be retrieved.");
    expect(run.phase).toBe("failed");
    expect(gatherJokeContext).not.toHaveBeenCalled();
    expect(await repository.loadById(run.id)).toEqual(run);
  });

  test("persists a failed run with Quiet Failure Details when joke context gathering fails", async () => {
    const orchestrateGeneration = vi.fn();
    const discoverNewsLinkedImages = vi.fn();
    const { deps, repository } = buildDeps({
      gatherJokeContext: async () => {
        throw new JokeContextGatheringError(
          "Joke context gathering could not form usable context.",
          ["Started fixture context gathering.", "Tweet text was too thin."],
        );
      },
      orchestrateGeneration,
      discoverNewsLinkedImages,
    });

    const run = expectRun(await composeManualRun({ runId, sourceTweetUrl, usersDirection }, deps));

    expect(run.status).toBe("failed");
    expect(run.origin).toBe("manual");
    expect(run.seenAt).toBeUndefined();
    expect(run.generationResultStates?.contextGathering).toMatchObject({
      status: "failed",
      debugLog: ["Started fixture context gathering.", "Tweet text was too thin."],
    });
    expect(run.generationResultStates?.textGeneration.status).toBe("not-started");

    // No creative branch starts once context gathering fails (No Automatic Retry).
    expect(orchestrateGeneration).not.toHaveBeenCalled();
    expect(discoverNewsLinkedImages).not.toHaveBeenCalled();
    expect(await repository.loadById(run.id)).toEqual(run);
  });

  test("persists nothing when no operator can be resolved", async () => {
    const retrieveTweetContext = vi.fn();
    const { deps, repository } = buildDeps({
      resolveRepository: async () => ({ unauthorized: true }),
      retrieveTweetContext,
    });

    const result = await composeManualRun({ runId, sourceTweetUrl, usersDirection }, deps);

    expect(result).toEqual({ unauthorized: true });
    expect(retrieveTweetContext).not.toHaveBeenCalled();
    expect(await repository.list()).toEqual([]);
  });
});
