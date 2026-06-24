import "server-only";

import { getOperatorSession } from "@/services/auth/operator-session";
import {
  assembleImageOriginalCandidates,
  defaultImagePrompt,
  deriveAutomatedSelection,
  draftTarget,
  type FailedImageSet,
  type GenerationResultStates,
  type ImageModelProvenance,
  type ImageSet,
  type JokeContextSnapshot,
  type NewsLinkedImage,
  parseGenerationResultStates,
  parseSavedGenerationRun,
  type SavedGenerationRun,
} from "@/services/generation";
import {
  type GenerationOrchestrator,
  orchestrateThreeProviderGeneration,
} from "@/services/generation/generation-orchestrator";
import {
  generateImageSetForRun,
  type ImageGenerationServiceResult,
} from "@/services/generation/image-generation-service";
import {
  gatherJokeContext,
  JokeContextGatheringError,
  type JokeContextGatheringInput,
} from "@/services/joke-context-gathering";
import { classifyNewsCategory } from "@/services/news-category-classifier";
import {
  discoverNewsLinkedImages,
  type NewsLinkedImageDiscoveryService,
  NewsLinkedImageDiscoveryUnavailableError,
} from "@/services/news-linked-image-discovery";
import { buildReplySignals, type ReplySignal } from "@/services/outside-x-enrichment";
import { persistImageSetToOwnerStorage } from "@/services/saved-runs/persist-image-set-to-owner-storage";
import { normalizeRunForPersistence } from "@/services/saved-runs/run-persistence";
import {
  type OperatorSessionReader,
  resolveRunRepository,
} from "@/services/saved-runs/run-repository";
import {
  type RetrievedSourceTweet,
  type RetrievedTweetContext,
  retrieveTweetContext,
  TweetRetrievalError,
  type TweetRetrievalService,
} from "@/services/tweet-retrieval";

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
  const retrieve = dependencies.retrieveTweetContext ?? retrieveTweetContext;
  const gather = dependencies.gatherJokeContext ?? gatherJokeContext;
  const discover = dependencies.discoverNewsLinkedImages ?? discoverNewsLinkedImages;
  const orchestrate = dependencies.orchestrateGeneration ?? orchestrateThreeProviderGeneration;
  const classify = dependencies.classifyNewsCategory ?? classifyNewsCategory;
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
  const baseLabel = buildAutomatedRunLabel(input.sourceTweetUrl);

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

  // 1. Tweet retrieval. A failure persists a failed run so it still appears in
  //    the unified list with its concise failure state.
  let tweetContext: RetrievedTweetContext;

  try {
    tweetContext = await retrieve({ sourceTweetUrl: input.sourceTweetUrl });
  } catch (error) {
    const message =
      error instanceof TweetRetrievalError
        ? error.userMessage
        : "Source tweet could not be retrieved.";

    return saveAutomatedRun({
      ...buildBaseRun(baseLabel),
      status: "failed",
      draftCount: 0,
      drafts: [],
      failureMessage: message,
      phase: "failed",
    });
  }

  const sourceTweet = tweetContext.sourceTweet;

  // 2. Joke context gathering. A failure short-circuits the creative branches —
  //    no Text Generation, discovery, or Image Generation is attempted — and
  //    persists a failed run carrying the Quiet Failure Details (the gathering
  //    debug log).
  const contextStartedAt = now().toISOString();
  let jokeContextSnapshot: JokeContextSnapshot;

  try {
    jokeContextSnapshot = await gather({ tweetContext });
  } catch (error) {
    const debugLog = error instanceof JokeContextGatheringError ? error.debugLog : [];
    const message =
      error instanceof JokeContextGatheringError
        ? error.userMessage
        : "Joke context gathering could not form usable context.";

    return saveAutomatedRun({
      ...buildBaseRun(baseLabel),
      sourceTweet,
      status: "failed",
      draftCount: 0,
      drafts: [],
      failureMessage: message,
      generationResultStates: parseGenerationResultStates({
        contextGathering: {
          status: "failed",
          startedAt: contextStartedAt,
          failedAt: now().toISOString(),
          message,
          ...(debugLog.length > 0 ? { debugLog } : {}),
        },
        textGeneration: { status: "not-started" },
        newsLinkedImageDiscovery: { status: "not-started" },
        imageGeneration: { status: "not-started" },
      }),
      phase: "failed",
    });
  }

  const contextCompletedAt = now().toISOString();

  // 3. News-Linked Image Discovery, three-provider generation, and News Category
  //    classification run together — all depend only on the snapshot.
  const creativeStartedAt = now().toISOString();
  const replySignals = buildReplySignals(tweetContext);
  const discoveryPromise = runNewsLinkedImageDiscovery({
    discover,
    now,
    replySignals,
    sourceTweet,
    startedAt: creativeStartedAt,
  });
  const orchestrationPromise = orchestrate(
    {
      jokeContextSnapshot,
      sourceTweet,
      sourceTweetUrl: input.sourceTweetUrl,
      usersDirection: "",
    },
    // An Automated Run bills the spend-capped automated key for every AI Gateway
    // call (Text Generation, classification, Image Generation), isolating the
    // cron's spend from Workspace users on the shared key.
    { runKind: "automated" },
  )
    .then((run) => ({ run, status: "fulfilled" as const }))
    .catch((error: unknown) => ({ error, status: "rejected" as const }));
  // The classifier reads only the snapshot, so it never steers the drafts. It
  // never throws — on any failure it yields a failed state plus a VIRAL fallback —
  // so it needs no rejection guard and can never block the run from completing.
  const classificationPromise = classify({ jokeContextSnapshot }, { now, runKind: "automated" });

  const discoveryResult = await discoveryPromise;
  const orchestrationResult = await orchestrationPromise;
  const classificationResult = await classificationPromise;
  const completedRun =
    orchestrationResult.status === "fulfilled" ? orchestrationResult.run : undefined;
  const drafts = completedRun?.drafts ?? [];
  const textGenerationState: GenerationResultStates["textGeneration"] = completedRun
    ?.generationResultStates?.textGeneration ?? {
    status: "failed",
    startedAt: creativeStartedAt,
    failedAt: now().toISOString(),
    message: "Text generation could not produce a usable draft set.",
  };

  // 4. Image Original Candidates: Source Tweet media first, topped up by
  //    News-Linked Images only when the tweet supplies fewer than four.
  const imageOriginalCandidates = assembleImageOriginalCandidates({
    newsLinkedImages:
      discoveryResult.status === "available" ? discoveryResult.newsLinkedImages : [],
    sourceTweetMedia: sourceTweet.mediaReferences,
  });

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
    contextGathering: {
      status: "completed",
      startedAt: contextStartedAt,
      completedAt: contextCompletedAt,
      jokeContextSnapshot,
    },
    textGeneration: textGenerationState,
    newsLinkedImageDiscovery: discoveryResult.state,
    imageGeneration: imageGenerationState,
  });
  const isSuccessful = isSuccessfulRun(generationResultStates);

  return saveAutomatedRun({
    ...buildBaseRun(completedRun?.label ?? baseLabel),
    sourceTweet,
    jokeContextSnapshot,
    // The stamp the operator can later override per fanned-out copy. The classifier
    // always resolves a value (VIRAL on failure) and a terminal state; the failed
    // state is persisted so the ghost icon + Quiet Failure Details survive reopen,
    // and it is deliberately NOT part of the Successful Run determination below.
    newsCategory: classificationResult.newsCategory,
    newsCategoryClassification: classificationResult.classification,
    status: isSuccessful ? "completed" : "failed",
    draftCount: drafts.length,
    drafts,
    ...(completedRun?.fallbackDisclosure
      ? { fallbackDisclosure: completedRun.fallbackDisclosure }
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
    ...(discoveryResult.status === "available"
      ? { newsLinkedImages: discoveryResult.newsLinkedImages }
      : {}),
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

type NewsLinkedImageDiscoveryOutcome =
  | {
      status: "available";
      newsLinkedImages: NewsLinkedImage[];
      state: GenerationResultStates["newsLinkedImageDiscovery"];
    }
  | { status: "failed"; state: GenerationResultStates["newsLinkedImageDiscovery"] };

async function runNewsLinkedImageDiscovery({
  discover,
  now,
  replySignals,
  sourceTweet,
  startedAt,
}: {
  discover: NewsLinkedImageDiscoveryService;
  now: () => Date;
  replySignals: ReplySignal[];
  sourceTweet: RetrievedSourceTweet;
  startedAt: string;
}): Promise<NewsLinkedImageDiscoveryOutcome> {
  try {
    const result = await discover({ replySignals, sourceTweet });

    if (result.newsLinkedImages.length === 0) {
      return {
        status: "failed",
        state: {
          status: "failed",
          startedAt,
          failedAt: now().toISOString(),
          message: "News-linked image discovery could not find qualifying images.",
        },
      };
    }

    return {
      status: "available",
      newsLinkedImages: result.newsLinkedImages,
      state: {
        status: "completed",
        startedAt,
        completedAt: now().toISOString(),
        newsLinkedImages: result.newsLinkedImages,
      },
    };
  } catch (error) {
    const message =
      error instanceof NewsLinkedImageDiscoveryUnavailableError &&
      process.env.NODE_ENV !== "production"
        ? "News-linked image discovery is unavailable in local development without OUTSIDE_X_ENRICHMENT_ENDPOINT."
        : "News-linked image discovery could not find qualifying images.";

    return {
      status: "failed",
      state: { status: "failed", startedAt, failedAt: now().toISOString(), message },
    };
  }
}

/**
 * Successful Run: Joke Context Gathering succeeded and at least one creative
 * result area succeeded. Mirrors the rule the saved-run schema enforces (Text
 * Generation and News-Linked Image Discovery are the counted areas) so the
 * composition never builds a run the schema rejects.
 */
function isSuccessfulRun(states: GenerationResultStates): boolean {
  if (states.contextGathering.status !== "completed") {
    return false;
  }

  const completedCreativeAreas = [
    states.textGeneration.status === "completed",
    states.newsLinkedImageDiscovery.status === "completed",
  ].filter(Boolean).length;

  return completedCreativeAreas > 0;
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

function buildAutomatedRunLabel(sourceTweetUrl: string): string {
  const statusId = sourceTweetUrl.match(/status\/([^/?#]+)/)?.[1] ?? "tweet";

  return `Automated run for ${statusId}`;
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
