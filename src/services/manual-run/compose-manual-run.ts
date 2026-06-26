import "server-only";

import { getOperatorSession } from "@/services/auth/operator-session";
import {
  draftTarget,
  type GenerationResultStates,
  type JokeContextSnapshot,
  parseGenerationResultStates,
  parseSavedGenerationRun,
  type SavedGenerationRun,
} from "@/services/generation";
import { composeQuoteRepostCore } from "@/services/generation/compose-quote-repost-core";
import type { GenerationOrchestrator } from "@/services/generation/generation-orchestrator";
import type { JokeContextGatheringInput } from "@/services/joke-context-gathering";
import type { classifyNewsCategory } from "@/services/news-category-classifier";
import type { NewsLinkedImageDiscoveryService } from "@/services/news-linked-image-discovery";
import { normalizeRunForPersistence } from "@/services/saved-runs/run-persistence";
import {
  type OperatorSessionReader,
  resolveRunRepository,
} from "@/services/saved-runs/run-repository";
import type { TweetRetrievalService } from "@/services/tweet-retrieval";

type ManualRunEnvironment = Readonly<Record<string, string | undefined>>;

export type ComposeManualRunInput = {
  sourceTweetUrl: string;
  // The operator's creative steering, fed only to Text Generation. Empty when the
  // operator submits no direction.
  usersDirection: string;
  // The client-minted run id (stable optimistic UI; a single id avoids collisions
  // on the owner/run composite key). Minted server-side when absent.
  runId?: string;
};

export type ComposeManualRunDependencies = {
  retrieveTweetContext?: TweetRetrievalService;
  gatherJokeContext?: (input: JokeContextGatheringInput) => Promise<JokeContextSnapshot>;
  discoverNewsLinkedImages?: NewsLinkedImageDiscoveryService;
  orchestrateGeneration?: GenerationOrchestrator;
  // Classifies the run's News Category from its Joke Context Snapshot (ADR-0027),
  // parallel to Text Generation and News-Linked Image Discovery. Defaults to the
  // real classifier, which reads only the snapshot, never throws, and falls back
  // to VIRAL on any failure.
  classifyNewsCategory?: typeof classifyNewsCategory;
  resolveRepository?: typeof resolveRunRepository;
  // How the Operator Account is resolved for persistence. Defaults to the session
  // -cookie reader; threaded into the default `resolveRepository`.
  operatorSession?: OperatorSessionReader;
  // Environment the persistence resolver reads. Defaults to process.env.
  env?: ManualRunEnvironment;
  now?: () => Date;
  createRunId?: () => string;
};

export type ComposeManualRunResult = { run: SavedGenerationRun } | { unauthorized: true };

/**
 * Runs a server-driven Manual Run: it composes the shared tweet→candidates
 * pipeline every entry point uses via {@link composeQuoteRepostCore}, then
 * assembles and persists a saved run under the signed-in Operator Account. Manual
 * policy is the only difference from the Automated Run wrapper: run-kind manual
 * (bills the shared Workspace AI Gateway key), origin manual, image-prompt source
 * user, the operator's direction threaded into Text Generation, and **none** of
 * inline Image Generation, Automated Selection, or fan-out — the operator
 * generates images afterward through the existing operator-triggered flow.
 *
 * The run is created unseen and carries no Image Set or selection. A composition
 * that ends in a `failed` descriptor (or composes with no successful creative
 * area) is still persisted as a failed run so it appears in the unified list with
 * its Quiet Failure Details, mirroring the Automated Run failure contract. Each
 * step runs once — No Automatic Retry.
 */
export async function composeManualRun(
  input: ComposeManualRunInput,
  dependencies: ComposeManualRunDependencies = {},
): Promise<ComposeManualRunResult> {
  const env = dependencies.env ?? process.env;
  const operatorSession = dependencies.operatorSession ?? getOperatorSession;
  const resolveRepository =
    dependencies.resolveRepository ?? (() => resolveRunRepository(env, operatorSession));
  const now = dependencies.now ?? (() => new Date());
  const createRunId = dependencies.createRunId ?? defaultCreateRunId;

  // The run is owned by the signed-in Operator Account. Resolve it first so an
  // unauthorized request persists nothing.
  const repositoryResolution = await resolveRepository();

  if ("unauthorized" in repositoryResolution) {
    return { unauthorized: true };
  }

  const repository = repositoryResolution.repository;
  const runId = input.runId ?? createRunId();
  const baseLabel = buildManualRunLabel(input.sourceTweetUrl);

  function buildBaseRun(label: string) {
    return {
      id: runId,
      label,
      origin: "manual" as const,
      // A Manual Run steers Image Generation with the operator's User Image Prompt.
      imagePromptSource: "user" as const,
      sourceTweetUrl: input.sourceTweetUrl,
      usersDirection: input.usersDirection,
      draftTarget,
      savedAt: now().toISOString(),
      // `seenAt` is deliberately omitted — the finished run is unseen.
    };
  }

  // The assembled run is validated through the saved-run schema before persistence,
  // so a malformed composition fails loudly here rather than silently storing a bad
  // run. Inputs are built object-by-object; zod is the type guarantee.
  async function saveManualRun(run: unknown): Promise<{ run: SavedGenerationRun }> {
    const normalized = normalizeRunForPersistence(parseSavedGenerationRun(run));

    await repository.save(normalized);

    return { run: normalized };
  }

  // Steps 1–4 — tweet retrieval, joke context gathering, the parallel creative
  // block, and Image Original Candidate assembly — run through the shared core. A
  // Manual Run bills the shared Workspace key and threads the operator's direction
  // into Text Generation.
  const composition = await composeQuoteRepostCore(
    { sourceTweetUrl: input.sourceTweetUrl, usersDirection: input.usersDirection },
    {
      runKind: "manual",
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
      return saveManualRun({
        ...buildBaseRun(baseLabel),
        status: "failed",
        draftCount: 0,
        drafts: [],
        failureMessage: composition.failureMessage,
        phase: "failed",
      });
    }

    // Joke context gathering failed: no creative branch ran. Persist a failed run
    // carrying the Quiet Failure Details plus the not-started creative areas, adding
    // the not-started Image Generation area the core does not track.
    return saveManualRun({
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

  const generationResultStates = parseGenerationResultStates({
    ...composition.creativeResultStates,
    imageGeneration: { status: "not-started" },
  });
  const isSuccessful = isSuccessfulRun(generationResultStates);
  const hasImageOriginalCandidates = composition.imageOriginalCandidates.length > 0;

  return saveManualRun({
    ...buildBaseRun(composition.orchestratorLabel ?? baseLabel),
    sourceTweet: composition.sourceTweet,
    jokeContextSnapshot: composition.jokeContextSnapshot,
    // The classifier's stamp plus its terminal state, persisted so a failed
    // classification surfaces (ghost icon + Quiet Failure Details) on reopen. It is
    // NOT a Creative Result Area and never affects the Successful Run determination.
    newsCategory: composition.newsCategory,
    newsCategoryClassification: composition.newsCategoryClassification,
    status: isSuccessful ? "completed" : "failed",
    draftCount: composition.drafts.length,
    drafts: composition.drafts,
    ...(composition.fallbackDisclosure
      ? { fallbackDisclosure: composition.fallbackDisclosure }
      : {}),
    ...(isSuccessful
      ? {}
      : { failureMessage: "Manual run could not complete any creative result area." }),
    generationResultStates,
    ...(hasImageOriginalCandidates
      ? { imageOriginalCandidates: composition.imageOriginalCandidates }
      : {}),
    // Image Generation is the operator's next step, run later through the existing
    // operator-triggered flow — never inline here, so no Image Set or selection.
    imageGenerationState: { status: "not-started" },
    ...(composition.newsLinkedImages.length > 0
      ? { newsLinkedImages: composition.newsLinkedImages }
      : {}),
    phase: deriveManualRunPhase({ hasImageOriginalCandidates, isSuccessful }),
  });
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

function deriveManualRunPhase({
  hasImageOriginalCandidates,
  isSuccessful,
}: {
  hasImageOriginalCandidates: boolean;
  isSuccessful: boolean;
}): SavedGenerationRun["phase"] {
  if (!isSuccessful) {
    return "failed";
  }

  // A successful Manual Run stops at Image Original Candidates: the operator picks
  // one and triggers Image Generation next. With no candidates there is nothing to
  // select, so the run carries no phase.
  return hasImageOriginalCandidates ? "waiting-for-image-selection" : undefined;
}

function buildManualRunLabel(sourceTweetUrl: string): string {
  const statusId = sourceTweetUrl.match(/status\/([^/?#]+)/)?.[1] ?? "tweet";

  return `Manual run for ${statusId}`;
}

function defaultCreateRunId(): string {
  return `run-${crypto.randomUUID()}`;
}
