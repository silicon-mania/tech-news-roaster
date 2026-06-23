import { describe, expect, test, vi } from "vitest";
import { findSelectedVariation } from "@/components/workspace/quote-tweet-selection";
import {
  collectCompletedImageSets,
  defaultImagePrompt,
  type ImageSet,
  type NewsCategory,
  parseCompletedGenerationRunPayload,
  parseFailedImageSet,
  parseImageSet,
  parseJokeContextSnapshot,
} from "@/services/generation";
import { buildImageSet, buildJokeContextSnapshot } from "@/services/generation/test-fixtures";
import { JokeContextGatheringError } from "@/services/joke-context-gathering";
import type {
  NewsCategoryClassificationResult,
  NewsCategoryClassifierInput,
} from "@/services/news-category-classifier";
import { createInMemoryRunRepository } from "@/services/saved-runs/in-memory-run-repository";
import { buildFixtureTweetContext, TweetRetrievalError } from "@/services/tweet-retrieval";
import { type ComposeAutomatedRunDependencies, composeAutomatedRun } from "./compose-automated-run";

const fixedNow = () => new Date("2026-06-16T12:00:00.000Z");
const sourceTweetUrl = "https://x.com/siliconmania/status/1234";
const origin = "https://app.test";
const runId = "run-automated-test";
// The first Image Original Candidate the fixture Source Tweet yields (its first
// usable image), which Automated Selection picks as the Selected Image Original.
const firstCandidateId = "source-tweet-media-candidate-fixture-media-1";

type GenerateImageSetArgs = Parameters<
  NonNullable<ComposeAutomatedRunDependencies["generateImageSet"]>
>[0];

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

/**
 * Mimics the real byte-persistence step: rewrites every Image Set option URL to
 * an owner-scoped served route so the persisted run carries no raw bytes.
 */
function rewriteImageSetToServed(imageSet: ImageSet, runOrigin: string, persistedRunId: string) {
  const options = imageSet.options.map((option) => ({
    ...option,
    url: `${runOrigin}/api/runs/${encodeURIComponent(persistedRunId)}/images/${encodeURIComponent(
      option.id,
    )}`,
  }));

  return parseImageSet({
    ...imageSet,
    options,
    selectedImageOriginal: { ...imageSet.selectedImageOriginal, url: options[0].url },
  });
}

function buildDeps(overrides: Partial<ComposeAutomatedRunDependencies> = {}) {
  const repository = createInMemoryRunRepository("operator-account", new Map());
  const deps: ComposeAutomatedRunDependencies = {
    retrieveTweetContext: async ({ sourceTweetUrl: requestedUrl }) =>
      buildFixtureTweetContext(requestedUrl),
    gatherJokeContext: async () => jokeContextSnapshot,
    discoverNewsLinkedImages: async () => ({
      discoveredAt: "2026-06-05T10:20:00.000Z",
      newsLinkedImages: buildNewsLinkedImages(),
    }),
    orchestrateGeneration: async () => buildCompletedPayload(),
    classifyNewsCategory: async () => buildClassificationResult(),
    generateImageSet: async () => ({
      imageModelProvenance: { model: "image-model-v1", provider: "ai-gateway" },
      imageSet: parseImageSet(buildImageSet()),
      selectedImageOriginal: parseImageSet(buildImageSet()).selectedImageOriginal,
    }),
    persistImageSet: async ({ imageSet, origin: runOrigin, runId: persistedRunId }) =>
      rewriteImageSetToServed(imageSet, runOrigin, persistedRunId),
    resolveRepository: async () => ({ repository }),
    now: fixedNow,
    createRunId: () => runId,
    origin,
    ...overrides,
  };

  return { deps, repository };
}

function expectRun(result: Awaited<ReturnType<typeof composeAutomatedRun>>) {
  if ("unauthorized" in result) {
    throw new Error("Expected a composed run, got unauthorized.");
  }

  return result.run;
}

describe("composeAutomatedRun", () => {
  test("composes an Automated Run to a Final Quote Tweet Image and persists it under the operator", async () => {
    const { deps, repository } = buildDeps();

    const run = expectRun(
      await composeAutomatedRun(
        { sourceTweetUrl, newsCoverageClusterId: "news-coverage-cluster-1" },
        deps,
      ),
    );

    // Provenance: automated, Default Image Prompt, linked to its cluster, unseen.
    expect(run.origin).toBe("automated");
    expect(run.imagePromptSource).toBe("default");
    expect(run.newsCoverageClusterId).toBe("news-coverage-cluster-1");
    expect(run.seenAt).toBeUndefined();
    expect(run.status).toBe("completed");
    expect(run.usersDirection).toBe("");

    // Automated Selection wrote the Manual-Run picks.
    expect(run.selectedDraftId).toBe("draft-openai");
    expect(run.selectedGeneratedImage?.imageOptionId).toBe("image-option-variation-1");
    expect(run.selectedImageOriginal).toBeDefined();

    // The Final Quote Tweet Image is composable from the derived image pick
    // (ADR-0018) — the same resolution the overlay uses.
    expect(
      findSelectedVariation(collectCompletedImageSets(run), run.selectedGeneratedImage ?? null),
    ).not.toBeNull();

    // All four variations exist even though the first is auto-selected.
    const variations = run.imageSet?.options.filter((option) => option.kind === "variation");
    expect(variations).toHaveLength(4);

    // The run is owned by the operator: it is the one persisted in the repository.
    const persisted = await repository.loadById(run.id);
    expect(persisted).toEqual(run);
  });

  test("generates images with the Default Image Prompt from the first candidate, and persists the bytes", async () => {
    let imageGenerationArgs: GenerateImageSetArgs | undefined;
    const persistImageSet = vi.fn(
      async ({
        imageSet,
        origin: runOrigin,
        runId: persistedRunId,
      }: {
        imageSet: ImageSet;
        origin: string;
        runId: string;
      }) => rewriteImageSetToServed(imageSet, runOrigin, persistedRunId),
    );
    const { deps } = buildDeps({
      generateImageSet: async (args) => {
        imageGenerationArgs = args;

        return {
          imageModelProvenance: { model: "image-model-v1", provider: "ai-gateway" },
          imageSet: parseImageSet(buildImageSet()),
          selectedImageOriginal: parseImageSet(buildImageSet()).selectedImageOriginal,
        };
      },
      persistImageSet,
    });

    const run = expectRun(await composeAutomatedRun({ sourceTweetUrl }, deps));

    expect(imageGenerationArgs?.input).toEqual({
      parentRunId: runId,
      selectedImageId: firstCandidateId,
      userImagePrompt: defaultImagePrompt,
    });
    expect(run.imageGenerationState).toMatchObject({
      status: "completed",
      selectedImageId: firstCandidateId,
      userImagePrompt: defaultImagePrompt,
    });
    // Bytes were moved to owner storage and option URLs rewritten to served routes.
    expect(persistImageSet).toHaveBeenCalledWith({
      imageSet: expect.anything(),
      origin,
      runId,
    });
    expect(run.imageSet?.options[0].url).toBe(
      `${origin}/api/runs/${runId}/images/image-option-original-1`,
    );
  });

  test("preserves the orchestrator's Provider Fallback disclosure unchanged", async () => {
    const fallbackDisclosure =
      "Provider fallback used for Anthropic; duplicate model provenance is shown on affected drafts.";
    const { deps } = buildDeps({
      orchestrateGeneration: async () => buildCompletedPayload({ fallbackDisclosure }),
    });

    const run = expectRun(await composeAutomatedRun({ sourceTweetUrl }, deps));

    expect(run.fallbackDisclosure).toBe(fallbackDisclosure);
  });

  test("classifies the News Category from the snapshot and writes it onto the composed run", async () => {
    const classifyNewsCategory = vi.fn(
      async (_input: NewsCategoryClassifierInput): Promise<NewsCategoryClassificationResult> =>
        buildClassificationResult("ACQUIRED"),
    );
    const { deps, repository } = buildDeps({ classifyNewsCategory });

    const run = expectRun(await composeAutomatedRun({ sourceTweetUrl }, deps));

    // The classifier read only the Joke Context Snapshot — it never steers the drafts.
    expect(classifyNewsCategory).toHaveBeenCalledTimes(1);
    expect(classifyNewsCategory.mock.calls[0][0]).toEqual({ jokeContextSnapshot });

    // Its pick rides the run as the stamp, with the completed classification state.
    expect(run.newsCategory).toBe("ACQUIRED");
    expect(run.newsCategoryClassification).toEqual({
      completedAt: "2026-06-16T12:00:01.000Z",
      startedAt: "2026-06-16T12:00:00.000Z",
      status: "completed",
    });

    // It is the value on the persisted run, so it survives the per-operator fan-out copy.
    const persisted = await repository.loadById(run.id);
    expect(persisted?.newsCategory).toBe("ACQUIRED");
  });

  test("persists a failed classification and falls back to VIRAL, leaving the run Complete", async () => {
    const classifyNewsCategory = vi.fn(async () => buildFailedClassificationResult());
    const { deps, repository } = buildDeps({ classifyNewsCategory });

    const run = expectRun(await composeAutomatedRun({ sourceTweetUrl }, deps));

    // The stamp falls back to VIRAL and the failed state is persisted, so the ghost
    // icon + Quiet Failure Details survive reopen — including on an unseen automated run.
    expect(run.newsCategory).toBe("VIRAL");
    expect(run.newsCategoryClassification).toMatchObject({
      debugLog: [
        "Classifying News Category via test.",
        "Classification failed and the stamp fell back to VIRAL: Classifier timed out.",
      ],
      message: "Classifier timed out.",
      status: "failed",
    });

    // The failed classification is NOT a Creative Result Area: the run stays a
    // Successful, feed-eligible (Complete) run — the success determination is unchanged.
    expect(run.status).toBe("completed");
    expect(run.generationResultStates?.textGeneration.status).toBe("completed");
    const persisted = await repository.loadById(run.id);
    expect(persisted?.newsCategory).toBe("VIRAL");
    expect(await repository.list()).toHaveLength(1);
  });

  test("classifies in parallel with the creative branches and never blocks the run", async () => {
    let markOrchestrationStarted!: () => void;
    let markDiscoveryStarted!: () => void;
    const orchestrationStarted = new Promise<void>((resolve) => {
      markOrchestrationStarted = resolve;
    });
    const discoveryStarted = new Promise<void>((resolve) => {
      markDiscoveryStarted = resolve;
    });

    // The classifier settles only once BOTH creative branches have begun, so if
    // composition awaited it before kicking them off, this run would deadlock and the
    // test would time out rather than pass.
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
    const { deps } = buildDeps({
      classifyNewsCategory,
      discoverNewsLinkedImages,
      orchestrateGeneration,
    });

    const run = expectRun(await composeAutomatedRun({ sourceTweetUrl }, deps));

    // It completed: the classifier ran concurrently with — not before — the creative
    // branches, its pick is on the run, and the drafts are untouched by it.
    expect(classifyNewsCategory).toHaveBeenCalledTimes(1);
    expect(run.newsCategory).toBe("DROPPED");
    expect(run.status).toBe("completed");
    expect(run.drafts).toHaveLength(3);
  });

  test("records a partial failure (image generation) without retry and without a composable image", async () => {
    const generateImageSet = vi.fn(async () => ({
      imageModelProvenance: { model: "image-model-v1", provider: "ai-gateway" },
      failedImageSet: parseFailedImageSet({
        id: `failed-image-set-${firstCandidateId}`,
        failedAt: "2026-06-16T12:00:00.000Z",
        message: "Image generation failed for the selected original.",
        selectedImageId: firstCandidateId,
        debugLog: ["Step: generate-variations", "Image model: ai-gateway/image-model-v1"],
      }),
    }));
    const persistImageSet = vi.fn();
    const { deps, repository } = buildDeps({ generateImageSet, persistImageSet });

    const run = expectRun(await composeAutomatedRun({ sourceTweetUrl }, deps));

    // Text generation still succeeded, so it is a Successful Run that is saved.
    expect(run.status).toBe("completed");
    expect(run.imageSet).toBeUndefined();
    expect(run.failedImageSet?.debugLog).toEqual([
      "Step: generate-variations",
      "Image model: ai-gateway/image-model-v1",
    ]);
    expect(run.imageGenerationState?.status).toBe("failed");
    expect(run.generationResultStates?.imageGeneration.status).toBe("failed");
    expect(run.selectedGeneratedImage).toBeUndefined();

    // No Automatic Retry: image generation is attempted exactly once, and no bytes
    // are persisted when none were produced.
    expect(generateImageSet).toHaveBeenCalledTimes(1);
    expect(persistImageSet).not.toHaveBeenCalled();

    // The Final Quote Tweet Image is not composable without a generated variation.
    expect(
      findSelectedVariation(collectCompletedImageSets(run), run.selectedGeneratedImage ?? null),
    ).toBeNull();

    // It is still in the unified list, unseen and automated.
    const persisted = await repository.loadById(run.id);
    expect(persisted).toEqual(run);
    expect(persisted?.seenAt).toBeUndefined();
    expect(persisted?.origin).toBe("automated");
  });

  test("saves a failed run with Quiet Failure Details when joke context gathering fails, attempting no creative steps", async () => {
    const gatherJokeContext = vi.fn(async () => {
      throw new JokeContextGatheringError("Joke context gathering could not form usable context.", [
        "Started fixture context gathering.",
        "Tweet text was too thin.",
      ]);
    });
    const orchestrateGeneration = vi.fn();
    const discoverNewsLinkedImages = vi.fn();
    const generateImageSet = vi.fn();
    const { deps, repository } = buildDeps({
      gatherJokeContext,
      orchestrateGeneration,
      discoverNewsLinkedImages,
      generateImageSet,
    });

    const run = expectRun(await composeAutomatedRun({ sourceTweetUrl }, deps));

    expect(run.status).toBe("failed");
    expect(run.origin).toBe("automated");
    expect(run.seenAt).toBeUndefined();
    expect(run.generationResultStates?.contextGathering).toMatchObject({
      status: "failed",
      debugLog: ["Started fixture context gathering.", "Tweet text was too thin."],
    });
    expect(run.generationResultStates?.textGeneration.status).toBe("not-started");

    // The creative branches never start once context gathering fails (No Automatic Retry).
    expect(orchestrateGeneration).not.toHaveBeenCalled();
    expect(discoverNewsLinkedImages).not.toHaveBeenCalled();
    expect(generateImageSet).not.toHaveBeenCalled();

    expect(await repository.loadById(run.id)).toEqual(run);
  });

  test("saves a failed run when source tweet retrieval fails, attempting nothing downstream", async () => {
    const gatherJokeContext = vi.fn();
    const { deps, repository } = buildDeps({
      retrieveTweetContext: async () => {
        throw new TweetRetrievalError();
      },
      gatherJokeContext,
    });

    const run = expectRun(await composeAutomatedRun({ sourceTweetUrl }, deps));

    expect(run.status).toBe("failed");
    expect(run.origin).toBe("automated");
    expect(run.failureMessage).toBe("Source tweet could not be retrieved.");
    expect(gatherJokeContext).not.toHaveBeenCalled();
    expect(await repository.loadById(run.id)).toEqual(run);
  });

  test("starts nothing when no operator can be resolved", async () => {
    const retrieveTweetContext = vi.fn();
    const { deps, repository } = buildDeps({
      resolveRepository: async () => ({ unauthorized: true }),
      retrieveTweetContext,
    });

    const result = await composeAutomatedRun({ sourceTweetUrl }, deps);

    expect(result).toEqual({ unauthorized: true });
    expect(retrieveTweetContext).not.toHaveBeenCalled();
    expect(await repository.list()).toEqual([]);
  });
});
