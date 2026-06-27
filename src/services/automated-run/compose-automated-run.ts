import "server-only";

import { getOperatorSession } from "@/services/auth/operator-session";
import {
  buildRunLabel,
  defaultImagePrompt,
  deriveAutomatedSelection,
  draftTarget,
  type FailedImageSet,
  type GenerationResultStates,
  type ImageModelProvenance,
  type ImageSet,
  isSuccessfulRun,
  type JokeContextSnapshot,
  parseGenerationResultStates,
  parseSavedGenerationRun,
  type SavedGenerationRun,
} from "@/services/generation";
import { composeQuoteRepostCore } from "@/services/generation/compose-quote-repost-core";
import type { GenerationOrchestrator } from "@/services/generation/generation-orchestrator";
import {
  generateImageSetForRun,
  type ImageGenerationServiceResult,
} from "@/services/generation/image-generation-service";
import type { JokeContextGatheringInput } from "@/services/joke-context-gathering";
import type { classifyNewsCategory } from "@/services/news-category-classifier";
import type { NewsLinkedImageDiscoveryService } from "@/services/news-linked-image-discovery";
import { persistImageSetToOwnerStorage } from "@/services/saved-runs/persist-image-set-to-owner-storage";
import { normalizeRunForPersistence } from "@/services/saved-runs/run-persistence";
import {
  type OperatorSessionReader,
  resolveRunRepository,
} from "@/services/saved-runs/run-repository";
import type { TweetRetrievalService } from "@/services/tweet-retrieval";

type AutomatedRunEnvironment = Readonly<Record<string, string | undefined>>;

export type ComposeAutomatedRunInput = {
  sourceTweetUrl: string;
  // The News Coverage Cluster this run was started from, when invoked by a
  // Discovery Sweep (issue 020). Absent when invoked directly on a Source Tweet.
  newsCoverageClusterId?: string;
};

/**
 * Persists an Image Set's bytes to owner-scoped storage and returns it with its
 * option URLs rewritten to server routes. Injected so tests exercise the
 * composition without a storage backend or the network.
 */
type PersistImageSet = (params: {
  imageSet: ImageSet;
  origin: string;
  runId: string;
}) => Promise<ImageSet>;

export type ComposeAutomatedRunDependencies = {
  retrieveTweetContext?: TweetRetrievalService;
  gatherJokeContext?: (input: JokeContextGatheringInput) => Promise<JokeContextSnapshot>;
  discoverNewsLinkedImages?: NewsLinkedImageDiscoveryService;
  orchestrateGeneration?: GenerationOrchestrator;
  // Classifies the run's News Category from its Joke Context Snapshot (ADR-0027 /
  // issue 003) — one more creative-branch step, parallel to Text Generation and
  // News-Linked Image Discovery. Defaults to the real classifier service, which
  // reads only the snapshot, never throws, and falls back to VIRAL on any failure.
  classifyNewsCategory?: typeof classifyNewsCategory;
  generateImageSet?: typeof generateImageSetForRun;
  persistImageSet?: PersistImageSet;
  resolveRepository?: typeof resolveRunRepository;
  // How the Operator Account is resolved for persistence. Defaults to the session
  // -cookie reader (HTTP-triggered composition); the unattended Discovery Sweep
  // injects the headless allowlisted-email resolver, since a cron has no session.
  // Threaded into the default `resolveRepository` and `persistImageSet`.
  operatorSession?: OperatorSessionReader;
  // The image prompt fed to Image Generation. Defaults to the Default Image
  // Prompt — an automated run has no operator to write a User Image Prompt.
  imagePrompt?: string;
  // The deployment origin used to build served-image URLs (no HTTP request
  // exists in a server-driven composition). Defaults to APP_BASE_URL via `env`.
  origin?: string;
  // Environment the persistence resolvers and origin read. Defaults to process.env.
  env?: AutomatedRunEnvironment;
  now?: () => Date;
  createRunId?: () => string;
};

export type ComposeAutomatedRunResult = { run: SavedGenerationRun } | { unauthorized: true };

/**
 * Runs a non-streaming, server-driven Automated Run with no client, composing in
 * fixed order: tweet retrieval → joke context gathering → three-provider Text
 * Generation (reusing the Generation Orchestrator), News-Linked Image Discovery,
 * and News Category classification together → Image Original Candidate building →
 * Image Generation of four variations using the Default Image Prompt → Automated
 * Selection → server-side persistence under the Operator Account.
 *
 * Everything up to Image Original Candidates runs through the shared
 * {@link composeQuoteRepostCore}; this wrapper supplies only Automated Run policy
 * (run-kind automated, no operator direction) and owns the persistence-bearing
 * steps the core deliberately leaves out: Image Generation, Automated Selection,
 * and saving under the Operator Account.
 *
 * The run carries `origin: "automated"` and `imagePromptSource: "default"`, is
 * left unseen (`seenAt` absent), and **prepares but never publishes to X** —
 * there is simply no publish step; the operator posts manually later. A failed or
 * partially-successful run is still persisted with its Quiet Failure Details and
 * is **not** retried (each step runs once); Provider Fallback and Successful Run
 * semantics are inherited unchanged from the reused services.
 */
export async function composeAutomatedRun(
  input: ComposeAutomatedRunInput,
  dependencies: ComposeAutomatedRunDependencies = {},
): Promise<ComposeAutomatedRunResult> {
  const generateImageSet = dependencies.generateImageSet ?? generateImageSetForRun;
  const env = dependencies.env ?? process.env;
  const operatorSession = dependencies.operatorSession ?? getOperatorSession;
  const persistImageSet =
    dependencies.persistImageSet ??
    (({ imageSet, origin: imageOrigin, runId: imageRunId }) =>
      persistImageSetToOwnerStorage({
        imageSet,
        origin: imageOrigin,
        runId: imageRunId,
        env,
        getSession: operatorSession,
      }));
  const resolveRepository =
    dependencies.resolveRepository ?? (() => resolveRunRepository(env, operatorSession));
  const imagePrompt = dependencies.imagePrompt ?? defaultImagePrompt;
  const origin = dependencies.origin ?? resolveAutomatedRunOrigin(env);
  const now = dependencies.now ?? (() => new Date());
  const createRunId = dependencies.createRunId ?? defaultCreateRunId;

  // The run is owned by the Operator Account. Resolve it first: a sweep that
  // can't resolve an operator (Supabase configured, nobody signed in) must start
  // nothing rather than persist an unowned run.
  const repositoryResolution = await resolveRepository();

  if ("unauthorized" in repositoryResolution) {
    return { unauthorized: true };
  }

  const repository = repositoryResolution.repository;
  const runId = createRunId();
  const baseLabel = buildRunLabel(input.sourceTweetUrl);

  function buildBaseRun(label: string) {
    return {
      id: runId,
      label,
      origin: "automated" as const,
      imagePromptSource: "default" as const,
      ...(input.newsCoverageClusterId
        ? { newsCoverageClusterId: input.newsCoverageClusterId }
        : {}),
      sourceTweetUrl: input.sourceTweetUrl,
      // An automated run has no operator-supplied direction.
      usersDirection: "",
      draftTarget,
      savedAt: now().toISOString(),
      // `seenAt` is deliberately omitted — the finished run is unseen.
    };
  }

  // The assembled run is validated through the saved-run schema (the single
  // contract every run boundary parses against) before persistence, so a
  // malformed composition fails loudly here rather than silently storing a bad
  // run. Inputs are built object-by-object above; zod is the type guarantee.
  async function saveAutomatedRun(run: unknown): Promise<{ run: SavedGenerationRun }> {
    const normalized = normalizeRunForPersistence(parseSavedGenerationRun(run));

    await repository.save(normalized);

    return { run: normalized };
  }

  // Steps 1–4 — tweet retrieval, joke context gathering, the parallel creative
  // block (three-provider Text Generation + News-Linked Image Discovery + News
  // Category classification), and Image Original Candidate assembly — run through
  // the shared composition core. An Automated Run bills the spend-capped automated
  // key for every AI Gateway call, isolating the cron's spend from Workspace users
  // on the shared key, and carries no operator-supplied direction.
  const composition = await composeQuoteRepostCore(
    { sourceTweetUrl: input.sourceTweetUrl, usersDirection: "" },
    {
      runKind: "automated",
      retrieveTweetContext: dependencies.retrieveTweetContext,
      gatherJokeContext: dependencies.gatherJokeContext,
      discoverNewsLinkedImages: dependencies.discoverNewsLinkedImages,
      orchestrateGeneration: dependencies.orchestrateGeneration,
      classifyNewsCategory: dependencies.classifyNewsCategory,
      now,
    },
  );

  if (composition.status === "failed") {
    // Tweet retrieval failed: persist a failed run so it still appears in the
    // unified list with its concise failure state.
    if (composition.stage === "tweet-retrieval") {
      return saveAutomatedRun({
        ...buildBaseRun(baseLabel),
        status: "failed",
        draftCount: 0,
        drafts: [],
        failureMessage: composition.failureMessage,
        phase: "failed",
      });
    }

    // Joke context gathering failed: no creative branch ran. Persist a failed run
    // carrying the Quiet Failure Details (the gathering debug log) plus the
    // not-started creative areas, adding the caller-owned not-started Image
    // Generation area the core does not track.
    return saveAutomatedRun({
      ...buildBaseRun(baseLabel),
      sourceTweet: composition.sourceTweet,
      status: "failed",
      draftCount: 0,
      drafts: [],
      failureMessage: composition.failureMessage,
      generationResultStates: parseGenerationResultStates({
        ...composition.creativeResultStates,
        imageGeneration: { status: "not-started" },
      }),
      phase: "failed",
    });
  }

  const {
    creativeResultStates,
    drafts,
    imageOriginalCandidates,
    jokeContextSnapshot,
    newsLinkedImages,
    sourceTweet,
  } = composition;

  // 5. Image Generation of four variations from the first candidate, using the
  //    Default Image Prompt. All four are generated even though Automated
  //    Selection later auto-picks the first, so the operator can switch variation
  //    without regenerating.
  const firstCandidate = imageOriginalCandidates[0];
  let imageSet: ImageSet | undefined;
  let failedImageSet: FailedImageSet | undefined;
  let imageModelProvenance: ImageModelProvenance | undefined;
  let imageGenerationState: GenerationResultStates["imageGeneration"] = { status: "not-started" };

  if (firstCandidate) {
    const imageGenerationStartedAt = now().toISOString();
    const imageGenerationResult: ImageGenerationServiceResult = await generateImageSet(
      {
        input: {
          parentRunId: runId,
          selectedImageId: firstCandidate.id,
          userImagePrompt: imagePrompt,
        },
        parentRun: { id: runId, imageOriginalCandidates },
      },
      { now, runKind: "automated" },
    );

    imageModelProvenance = imageGenerationResult.imageModelProvenance;

    if (imageGenerationResult.imageSet) {
      imageSet = await persistImageSet({
        imageSet: imageGenerationResult.imageSet,
        origin,
        runId,
      });
      imageGenerationState = {
        status: "completed",
        selectedImageId: firstCandidate.id,
        userImagePrompt: imagePrompt,
        startedAt: imageGenerationStartedAt,
        completedAt: now().toISOString(),
      };
    } else {
      failedImageSet = imageGenerationResult.failedImageSet;
      imageGenerationState = {
        status: "failed",
        selectedImageId: firstCandidate.id,
        userImagePrompt: imagePrompt,
        startedAt: imageGenerationStartedAt,
        completedAt: now().toISOString(),
      };
    }
  }

  // 6. Automated Selection over the generated outputs: first draft, first candidate
  //    as original, first variation. Read from the persisted Image Set so the
  //    Selected Image Original's URL is the stored one.
  const selection = deriveAutomatedSelection(
    {
      drafts,
      imageOriginalCandidates,
      imageSet,
    },
    { now },
  );

  const generationResultStates = parseGenerationResultStates({
    ...creativeResultStates,
    imageGeneration: imageGenerationState,
  });
  const isSuccessful = isSuccessfulRun(generationResultStates);

  return saveAutomatedRun({
    ...buildBaseRun(composition.orchestratorLabel ?? baseLabel),
    sourceTweet,
    jokeContextSnapshot,
    // The stamp the operator can later override per fanned-out copy. The classifier
    // always resolves a value (VIRAL on failure) and a terminal state; the failed
    // state is persisted so the ghost icon + Quiet Failure Details survive reopen,
    // and it is deliberately NOT part of the Successful Run determination below.
    newsCategory: composition.newsCategory,
    newsCategoryClassification: composition.newsCategoryClassification,
    status: isSuccessful ? "completed" : "failed",
    draftCount: drafts.length,
    drafts,
    ...(composition.fallbackDisclosure
      ? { fallbackDisclosure: composition.fallbackDisclosure }
      : {}),
    ...(isSuccessful
      ? {}
      : { failureMessage: "Automated run could not complete any creative result area." }),
    generationResultStates,
    ...(imageOriginalCandidates.length > 0 ? { imageOriginalCandidates } : {}),
    ...(imageSet ? { imageSet } : {}),
    ...(failedImageSet ? { failedImageSet } : {}),
    ...(imageModelProvenance ? { imageModelProvenance } : {}),
    imageGenerationState,
    ...(newsLinkedImages.length > 0 ? { newsLinkedImages } : {}),
    ...(selection.selectedDraftId ? { selectedDraftId: selection.selectedDraftId } : {}),
    ...(selection.selectedGeneratedImage
      ? { selectedGeneratedImage: selection.selectedGeneratedImage }
      : {}),
    ...(selection.selectedImageOriginal
      ? { selectedImageOriginal: selection.selectedImageOriginal }
      : {}),
    phase: deriveAutomatedRunPhase({ failedImageSet, imageSet, isSuccessful }),
  });
}

function deriveAutomatedRunPhase({
  failedImageSet,
  imageSet,
  isSuccessful,
}: {
  failedImageSet?: FailedImageSet;
  imageSet?: ImageSet;
  isSuccessful: boolean;
}): SavedGenerationRun["phase"] {
  if (!isSuccessful) {
    return "failed";
  }

  if (imageSet) {
    return "image-generation-complete";
  }

  if (failedImageSet) {
    return "image-generation-failed";
  }

  return undefined;
}

function defaultCreateRunId(): string {
  return `run-${crypto.randomUUID()}`;
}

/**
 * The deployment origin served-image URLs are built against when no HTTP request
 * exists (a server-driven composition). Reads `APP_BASE_URL`; falls back to
 * localhost so local fixture runs still produce valid absolute URLs. Issue 020
 * supplies the real deployment origin when it wires the sweep in.
 */
function resolveAutomatedRunOrigin(env: AutomatedRunEnvironment = process.env): string {
  const configured = env.APP_BASE_URL?.trim();

  return configured ? configured.replace(/\/$/, "") : "http://localhost:3000";
}
