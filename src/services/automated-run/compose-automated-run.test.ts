import { describe, expect, test, vi } from "vitest";
import {
  findSelectedVariation,
  findSelectedVisualJoke,
} from "@/components/workspace/quote-tweet-selection";
import {
  collectCompletedImageSets,
  defaultImagePrompt,
  type ImageSet,
  parseCompletedGenerationRunPayload,
  parseFailedImageSet,
  parseImageSet,
  parseJokeContextSnapshot,
  parseVisualJokeSet,
} from "@/services/generation";
import {
  buildGenerationResultStates,
  buildImageSet,
  buildJokeContextSnapshot,
  buildVisualJokeSet,
} from "@/services/generation/test-fixtures";
import { JokeContextGatheringError } from "@/services/joke-context-gathering";
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
const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());

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
    visualJokeSet,
    generationResultStates: buildGenerationResultStates({ jokeContextSnapshot, visualJokeSet }),
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

    // Automated Selection wrote the four Manual-Run picks.
    expect(run.selectedDraftId).toBe("draft-openai");
    expect(run.selectedVisualJoke?.visualJokeId).toBe("visual-joke-1");
    expect(run.selectedGeneratedImage?.imageOptionId).toBe("image-option-variation-1");
    expect(run.selectedImageOriginal).toBeDefined();

    // The Final Quote Tweet Image is composable from the two derived picks
    // (ADR-0018) — the same resolution the overlay uses.
    expect(
      findSelectedVariation(collectCompletedImageSets(run), run.selectedGeneratedImage ?? null),
    ).not.toBeNull();
    expect(
      findSelectedVisualJoke(run.visualJokeSet, run.selectedVisualJoke ?? null),
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

    // Text + visual jokes still succeeded, so it is a Successful Run that is saved.
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
    expect(run.generationResultStates?.visualJokeGeneration.status).toBe("not-started");

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
