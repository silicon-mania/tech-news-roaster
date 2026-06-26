import "server-only";

import {
  assembleImageOriginalCandidates,
  type GenerationResultStates,
  type ImageOriginalCandidate,
  type JokeContextSnapshot,
  type NewsCategory,
  type NewsLinkedImage,
  type QuoteTweetDraft,
} from "@/services/generation";
import type { GatewayRunKind } from "@/services/generation/ai-gateway-models";
import {
  type GenerationOrchestrator,
  orchestrateThreeProviderGeneration,
} from "@/services/generation/generation-orchestrator";
import {
  gatherJokeContext,
  JokeContextGatheringError,
  type JokeContextGatheringInput,
} from "@/services/joke-context-gathering";
import type { NewsCategoryClassificationResult } from "@/services/news-category-classifier";
import { classifyNewsCategory } from "@/services/news-category-classifier";
import {
  discoverNewsLinkedImages,
  type NewsLinkedImageDiscoveryService,
  NewsLinkedImageDiscoveryUnavailableError,
} from "@/services/news-linked-image-discovery";
import { buildReplySignals, type ReplySignal } from "@/services/outside-x-enrichment";
import {
  type RetrievedSourceTweet,
  type RetrievedTweetContext,
  retrieveTweetContext,
  TweetRetrievalError,
  type TweetRetrievalService,
} from "@/services/tweet-retrieval";

export type ComposeQuoteRepostCoreInput = {
  sourceTweetUrl: string;
  // The operator's creative steering, fed only to Text Generation. Empty for an
  // automated run, which has no operator.
  usersDirection: string;
};

export type ComposeQuoteRepostCoreOptions = {
  // Which AI Gateway credential the orchestrator and classifier bill. Required —
  // never defaulted, since a wrong run kind mis-bills a separate spend cap.
  runKind: GatewayRunKind;
  retrieveTweetContext?: TweetRetrievalService;
  gatherJokeContext?: (input: JokeContextGatheringInput) => Promise<JokeContextSnapshot>;
  discoverNewsLinkedImages?: NewsLinkedImageDiscoveryService;
  orchestrateGeneration?: GenerationOrchestrator;
  classifyNewsCategory?: typeof classifyNewsCategory;
  now?: () => Date;
};

// The three creative-area states the core owns. The caller adds `imageGeneration`
// (its own concern) and validates the full set through the saved-run schema.
export type CreativeResultStates = Pick<
  GenerationResultStates,
  "contextGathering" | "textGeneration" | "newsLinkedImageDiscovery"
>;

export type ComposeQuoteRepostCoreComposed = {
  status: "composed";
  sourceTweet: RetrievedSourceTweet;
  jokeContextSnapshot: JokeContextSnapshot;
  // The orchestrator's run label, when Text Generation produced one. The caller
  // falls back to its own label when this is absent.
  orchestratorLabel?: string;
  drafts: QuoteTweetDraft[];
  fallbackDisclosure?: string;
  newsCategory: NewsCategory;
  newsCategoryClassification: NewsCategoryClassificationResult["classification"];
  imageOriginalCandidates: ImageOriginalCandidate[];
  // Empty when discovery found nothing or failed; the caller persists it only when
  // non-empty.
  newsLinkedImages: NewsLinkedImage[];
  creativeResultStates: CreativeResultStates;
};

export type ComposeQuoteRepostCoreFailed =
  | {
      status: "failed";
      stage: "tweet-retrieval";
      failureMessage: string;
    }
  | {
      status: "failed";
      stage: "joke-context";
      failureMessage: string;
      sourceTweet: RetrievedSourceTweet;
      // Carries the failed contextGathering state (with Quiet Failure Details); the
      // remaining creative areas are not-started since they never ran.
      creativeResultStates: CreativeResultStates;
    };

export type ComposeQuoteRepostCoreResult =
  | ComposeQuoteRepostCoreComposed
  | ComposeQuoteRepostCoreFailed;

/**
 * The single, shared composition pipeline from "we have a tweet URL" through
 * Image Original Candidates: tweet retrieval → joke context gathering → three
 * creative branches together (three-provider Text Generation, News-Linked Image
 * Discovery, and News Category classification) → Image Original Candidate
 * assembly. It is the one implementation every entry point composes through.
 *
 * It is deliberately **persistence-, auth-, and image-generation-agnostic**: it
 * resolves no operator, persists nothing, generates no images, derives no
 * selection, and fans nothing out. It returns a `composed` payload (the building
 * blocks a run is assembled from) or a typed `failed` descriptor. Each step runs
 * once — no retry — and the billing run kind is required so the caller's spend
 * cap is never crossed.
 */
export async function composeQuoteRepostCore(
  input: ComposeQuoteRepostCoreInput,
  options: ComposeQuoteRepostCoreOptions,
): Promise<ComposeQuoteRepostCoreResult> {
  const retrieve = options.retrieveTweetContext ?? retrieveTweetContext;
  const gather = options.gatherJokeContext ?? gatherJokeContext;
  const discover = options.discoverNewsLinkedImages ?? discoverNewsLinkedImages;
  const orchestrate = options.orchestrateGeneration ?? orchestrateThreeProviderGeneration;
  const classify = options.classifyNewsCategory ?? classifyNewsCategory;
  const now = options.now ?? (() => new Date());
  const runKind = options.runKind;

  // 1. Tweet retrieval. A failure ends composition immediately — the caller
  //    persists a failed run carrying the concise failure message.
  let tweetContext: RetrievedTweetContext;

  try {
    tweetContext = await retrieve({ sourceTweetUrl: input.sourceTweetUrl });
  } catch (error) {
    const message =
      error instanceof TweetRetrievalError
        ? error.userMessage
        : "Source tweet could not be retrieved.";

    return { status: "failed", stage: "tweet-retrieval", failureMessage: message };
  }

  const sourceTweet = tweetContext.sourceTweet;

  // 2. Joke context gathering. A failure short-circuits the creative branches —
  //    no Text Generation, discovery, or classification is attempted — and carries
  //    the Quiet Failure Details (the gathering debug log) back to the caller.
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

    return {
      status: "failed",
      stage: "joke-context",
      failureMessage: message,
      sourceTweet,
      creativeResultStates: {
        contextGathering: {
          status: "failed",
          startedAt: contextStartedAt,
          failedAt: now().toISOString(),
          message,
          ...(debugLog.length > 0 ? { debugLog } : {}),
        },
        textGeneration: { status: "not-started" },
        newsLinkedImageDiscovery: { status: "not-started" },
      },
    };
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
      usersDirection: input.usersDirection,
    },
    { runKind },
  )
    .then((run) => ({ run, status: "fulfilled" as const }))
    .catch((error: unknown) => ({ error, status: "rejected" as const }));
  // The classifier reads only the snapshot, so it never steers the drafts. It
  // never throws — on any failure it yields a failed state plus a VIRAL fallback —
  // so it needs no rejection guard and can never block the run from completing.
  const classificationPromise = classify({ jokeContextSnapshot }, { now, runKind });

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
  const newsLinkedImages =
    discoveryResult.status === "available" ? discoveryResult.newsLinkedImages : [];
  const imageOriginalCandidates = assembleImageOriginalCandidates({
    newsLinkedImages,
    sourceTweetMedia: sourceTweet.mediaReferences,
  });

  return {
    status: "composed",
    sourceTweet,
    jokeContextSnapshot,
    ...(completedRun?.label ? { orchestratorLabel: completedRun.label } : {}),
    drafts,
    ...(completedRun?.fallbackDisclosure
      ? { fallbackDisclosure: completedRun.fallbackDisclosure }
      : {}),
    newsCategory: classificationResult.newsCategory,
    newsCategoryClassification: classificationResult.classification,
    imageOriginalCandidates,
    newsLinkedImages,
    creativeResultStates: {
      contextGathering: {
        status: "completed",
        startedAt: contextStartedAt,
        completedAt: contextCompletedAt,
        jokeContextSnapshot,
      },
      textGeneration: textGenerationState,
      newsLinkedImageDiscovery: discoveryResult.state,
    },
  };
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
