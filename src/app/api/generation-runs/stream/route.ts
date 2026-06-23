import {
  assembleImageOriginalCandidates,
  buildCompletedGenerationRunEvents,
  buildEnrichmentCompletedEvent,
  buildGenerationFailureEvent,
  buildGenerationRunStateEvent,
  type CompletedGenerationRunPayload,
  draftTarget,
  type GenerationResultStates,
  type GenerationStreamEvent,
  type JokeContextSnapshot,
  type NewsLinkedImage,
  parseCompletedGenerationRunPayload,
  parseGenerationStreamEvent,
} from "@/services/generation";
import {
  type GenerationOrchestrator,
  orchestrateThreeProviderGeneration,
} from "@/services/generation/generation-orchestrator";
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
import { buildReplySignals } from "@/services/outside-x-enrichment";
import {
  retrieveTweetContext,
  TweetRetrievalError,
  type TweetRetrievalService,
} from "@/services/tweet-retrieval";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return streamGenerationRun(request);
}

export async function streamGenerationRun(
  request: Request,
  dependencies: {
    classifyNewsCategory?: typeof classifyNewsCategory;
    discoverNewsLinkedImages?: NewsLinkedImageDiscoveryService;
    gatherJokeContext?: (input: JokeContextGatheringInput) => Promise<JokeContextSnapshot>;
    orchestrateGeneration?: GenerationOrchestrator;
    retrieveTweetContext?: TweetRetrievalService;
  } = {},
) {
  const requestUrl = new URL(request.url);
  const sourceTweetUrl = requestUrl.searchParams.get("sourceTweetUrl") ?? "";
  const usersDirection = requestUrl.searchParams.get("usersDirection") ?? "";
  const encoder = new TextEncoder();
  const classify = dependencies.classifyNewsCategory ?? classifyNewsCategory;
  const discover = dependencies.discoverNewsLinkedImages ?? discoverNewsLinkedImages;
  const gather = dependencies.gatherJokeContext ?? gatherJokeContext;
  const retrieve = dependencies.retrieveTweetContext ?? retrieveTweetContext;
  const orchestrate = dependencies.orchestrateGeneration ?? orchestrateThreeProviderGeneration;
  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Each phase is enqueued the moment it resolves — context gathering, then
        // the creative branches, then enrichment, then drafts — so the workspace
        // advances as the run proceeds instead of staying frozen until a single
        // end-of-run flush. Mirrors the Image Generation stream.
        for await (const event of streamGenerationRunEvents({
          classify,
          discover,
          gather,
          orchestrate,
          retrieve,
          sourceTweetUrl,
          usersDirection,
        })) {
          enqueueGenerationEvent(controller, encoder, event);
        }
      } catch (error) {
        // A throw outside the known failure paths would otherwise abort the SSE
        // stream, leaving the client with a bare "Failed to fetch". Report a real
        // terminal failure through the stream and close cleanly instead.
        console.error("[generation] stream failed before completion", error);
        enqueueGenerationEvent(
          controller,
          encoder,
          buildGenerationFailureEvent("Generation failed before it could complete."),
        );
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
}

function enqueueGenerationEvent(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  event: GenerationStreamEvent,
) {
  const validatedEvent = parseGenerationStreamEvent(event);

  controller.enqueue(
    encoder.encode(`event: ${validatedEvent.type}\ndata: ${JSON.stringify(validatedEvent)}\n\n`),
  );
}

async function* streamGenerationRunEvents({
  classify,
  discover,
  gather,
  orchestrate,
  retrieve,
  sourceTweetUrl,
  usersDirection,
}: {
  classify: typeof classifyNewsCategory;
  discover: NewsLinkedImageDiscoveryService;
  gather: (input: JokeContextGatheringInput) => Promise<JokeContextSnapshot>;
  orchestrate: GenerationOrchestrator;
  retrieve: TweetRetrievalService;
  sourceTweetUrl: string;
  usersDirection: string;
}): AsyncGenerator<GenerationStreamEvent> {
  let tweetContext: Awaited<ReturnType<TweetRetrievalService>>;

  try {
    tweetContext = await retrieve({ sourceTweetUrl });
  } catch (error) {
    const message =
      error instanceof TweetRetrievalError
        ? error.userMessage
        : "Source tweet could not be retrieved.";

    yield buildGenerationFailureEvent(message);
    return;
  }

  const runLabel = buildGenerationRunLabel(sourceTweetUrl);
  const contextGatheringStartedAt = new Date().toISOString();

  yield buildGenerationRunStateEvent({
    generationResultStates: buildContextGatheringRunningStates(contextGatheringStartedAt),
    label: runLabel,
    sourceTweet: tweetContext.sourceTweet,
  });

  const replySignals = buildReplySignals(tweetContext);
  const jokeContextResult = await retrieveJokeContextSnapshot({
    gather,
    startedAt: contextGatheringStartedAt,
    tweetContext,
  });

  if (jokeContextResult.status === "failed") {
    yield buildGenerationRunStateEvent({
      generationResultStates: buildContextGatheringFailedStates(jokeContextResult),
      label: runLabel,
      sourceTweet: tweetContext.sourceTweet,
    });
    yield buildGenerationFailureEvent(jokeContextResult.message);
    return;
  }

  yield buildGenerationRunStateEvent({
    generationResultStates: buildContextGatheringCompletedStates(jokeContextResult),
    label: runLabel,
    sourceTweet: tweetContext.sourceTweet,
  });

  const newsLinkedImageDiscoveryStartedAt = new Date().toISOString();
  const textGenerationStartedAt = new Date().toISOString();
  const newsLinkedImageDiscoveryPromise = retrieveNewsLinkedImageDiscovery({
    discover,
    replySignals,
    sourceTweet: tweetContext.sourceTweet,
    startedAt: newsLinkedImageDiscoveryStartedAt,
  });
  const completedRunPromise = orchestrate({
    jokeContextSnapshot: jokeContextResult.jokeContextSnapshot,
    sourceTweet: tweetContext.sourceTweet,
    sourceTweetUrl,
    usersDirection,
  })
    .then((run) => ({ run, status: "fulfilled" as const }))
    .catch((error: unknown) => ({ error, status: "rejected" as const }));
  // News Category classification runs after Joke Context Gathering, in parallel
  // with Text Generation and News-Linked Image Discovery (ADR-0027 / issue 004).
  // It reads only the snapshot, never steers the drafts, and never throws — on any
  // failure it yields a failed state plus a VIRAL fallback — so it needs no
  // rejection guard and can never block the run from starting or completing. The
  // resolved stamp and its terminal state ride the completed payload, so the run
  // autosaved on completion already carries `newsCategory`.
  const newsCategoryClassificationPromise = classify({
    jokeContextSnapshot: jokeContextResult.jokeContextSnapshot,
  });

  // Text Generation and News-Linked Image Discovery are now in flight. Emit the
  // "running" state before awaiting them so the workspace shows the live creative
  // skeletons during the run's longest phase instead of freezing.
  yield buildGenerationRunStateEvent({
    generationResultStates: buildCreativeBranchesRunningStates({
      jokeContextResult,
      newsLinkedImageDiscoveryStartedAt,
      textGenerationStartedAt,
    }),
    label: runLabel,
    sourceTweet: tweetContext.sourceTweet,
  });

  const newsLinkedImageDiscoveryResult = await newsLinkedImageDiscoveryPromise;
  // The Source Tweet's own usable media leads the candidates; News-Linked Images
  // only top up the remaining slots (and only when discovery succeeded).
  const imageOriginalCandidates = assembleImageOriginalCandidates({
    newsLinkedImages:
      newsLinkedImageDiscoveryResult.status === "available"
        ? newsLinkedImageDiscoveryResult.newsLinkedImages
        : [],
    sourceTweetMedia: tweetContext.sourceTweet.mediaReferences,
  });
  const carriedImageOriginalCandidates =
    imageOriginalCandidates.length > 0 ? imageOriginalCandidates : undefined;

  if (newsLinkedImageDiscoveryResult.status === "available") {
    yield buildEnrichmentCompletedEvent({
      imageOriginalCandidates,
      newsLinkedImages: newsLinkedImageDiscoveryResult.newsLinkedImages,
      sourceTweet: tweetContext.sourceTweet,
    });
  }

  const generationResult = await completedRunPromise;
  const newsCategoryClassification = await newsCategoryClassificationPromise;

  if (generationResult.status === "rejected") {
    console.error("Generation orchestration failed.", generationResult.error);
    const terminalGenerationResultStates = buildTerminalGenerationResultStates({
      jokeContextResult,
      newsLinkedImageDiscoveryResult,
      textGeneration: {
        failedAt: new Date().toISOString(),
        message: "Text generation could not produce a usable draft set.",
        startedAt: textGenerationStartedAt,
        status: "failed",
      },
    });

    yield buildGenerationRunStateEvent({
      generationResultStates: terminalGenerationResultStates,
      label: runLabel,
      sourceTweet: tweetContext.sourceTweet,
    });

    if (newsLinkedImageDiscoveryResult.status === "available") {
      const completedRun = parseCompletedGenerationRunPayload({
        drafts: [],
        generationResultStates: terminalGenerationResultStates,
        imageOriginalCandidates: carriedImageOriginalCandidates,
        jokeContextSnapshot: jokeContextResult.jokeContextSnapshot,
        label: runLabel,
        newsCategory: newsCategoryClassification.newsCategory,
        newsCategoryClassification: newsCategoryClassification.classification,
        newsLinkedImages: newsLinkedImageDiscoveryResult.newsLinkedImages,
        sourceTweet: tweetContext.sourceTweet,
      });

      yield* buildCompletedGenerationRunEvents({ run: completedRun });
      return;
    }

    yield buildGenerationFailureEvent("Draft providers could not complete a three-draft run.");
    return;
  }

  const textGenerationCompletedAt = new Date().toISOString();
  const completedRun = parseCompletedGenerationRunPayload({
    ...generationResult.run,
    generationResultStates: buildCompletedGenerationResultStates({
      completedRun: generationResult.run,
      jokeContextResult,
      newsLinkedImageDiscoveryResult,
      textGenerationCompletedAt,
      textGenerationStartedAt,
    }),
    imageOriginalCandidates: carriedImageOriginalCandidates,
    jokeContextSnapshot: jokeContextResult.jokeContextSnapshot,
    label: generationResult.run.label,
    newsCategory: newsCategoryClassification.newsCategory,
    newsCategoryClassification: newsCategoryClassification.classification,
    newsLinkedImages:
      newsLinkedImageDiscoveryResult.status === "available"
        ? newsLinkedImageDiscoveryResult.newsLinkedImages
        : undefined,
    sourceTweet: generationResult.run.sourceTweet,
  });

  if (completedRun.generationResultStates) {
    yield buildGenerationRunStateEvent({
      generationResultStates: completedRun.generationResultStates,
      label: completedRun.label,
      sourceTweet: completedRun.sourceTweet,
    });
  }

  yield* buildCompletedGenerationRunEvents({ run: completedRun });
}

async function retrieveJokeContextSnapshot({
  gather,
  startedAt,
  tweetContext,
}: JokeContextGatheringInput & {
  gather: (input: JokeContextGatheringInput) => Promise<JokeContextSnapshot>;
  startedAt?: string;
}): Promise<
  | {
      completedAt: string;
      jokeContextSnapshot: JokeContextSnapshot;
      startedAt: string;
      status: "completed";
    }
  | {
      debugLog?: string[];
      failedAt: string;
      message: string;
      startedAt: string;
      status: "failed";
    }
> {
  const effectiveStartedAt = startedAt ?? new Date().toISOString();

  try {
    const jokeContextSnapshot = await gather({ tweetContext });

    return {
      completedAt: new Date().toISOString(),
      jokeContextSnapshot,
      startedAt: effectiveStartedAt,
      status: "completed",
    };
  } catch (error) {
    const message =
      error instanceof JokeContextGatheringError
        ? error.userMessage
        : "Joke context gathering could not form usable context.";

    return {
      debugLog: error instanceof JokeContextGatheringError ? error.debugLog : undefined,
      failedAt: new Date().toISOString(),
      message,
      startedAt: effectiveStartedAt,
      status: "failed",
    };
  }
}

async function retrieveNewsLinkedImageDiscovery({
  discover,
  replySignals,
  sourceTweet,
  startedAt,
}: Parameters<NewsLinkedImageDiscoveryService>[0] & {
  discover: NewsLinkedImageDiscoveryService;
  startedAt?: string;
}): Promise<
  | {
      completedAt: string;
      newsLinkedImages: NewsLinkedImage[];
      startedAt: string;
      status: "available";
    }
  | {
      failedAt: string;
      message: string;
      startedAt: string;
      status: "failed";
    }
> {
  const effectiveStartedAt = startedAt ?? new Date().toISOString();

  try {
    const discoveryResult = await discover({
      replySignals,
      sourceTweet,
    });

    if (discoveryResult.newsLinkedImages.length === 0) {
      return {
        failedAt: new Date().toISOString(),
        message: "News-linked image discovery could not find qualifying images.",
        startedAt: effectiveStartedAt,
        status: "failed",
      };
    }

    return {
      completedAt: new Date().toISOString(),
      newsLinkedImages: discoveryResult.newsLinkedImages,
      startedAt: effectiveStartedAt,
      status: "available",
    };
  } catch (error) {
    if (
      error instanceof NewsLinkedImageDiscoveryUnavailableError &&
      process.env.NODE_ENV !== "production"
    ) {
      return {
        failedAt: new Date().toISOString(),
        message:
          "News-linked image discovery is unavailable in local development without OUTSIDE_X_ENRICHMENT_ENDPOINT.",
        startedAt: effectiveStartedAt,
        status: "failed",
      };
    }

    return {
      failedAt: new Date().toISOString(),
      message: "News-linked image discovery could not find qualifying images.",
      startedAt: effectiveStartedAt,
      status: "failed",
    };
  }
}

function buildContextGatheringRunningStates(startedAt: string): GenerationResultStates {
  return {
    contextGathering: {
      startedAt,
      status: "running",
    },
    imageGeneration: {
      status: "not-started",
    },
    newsLinkedImageDiscovery: {
      status: "not-started",
    },
    textGeneration: {
      status: "not-started",
    },
  };
}

function buildContextGatheringCompletedStates(
  jokeContextResult: Extract<
    Awaited<ReturnType<typeof retrieveJokeContextSnapshot>>,
    { status: "completed" }
  >,
): GenerationResultStates {
  return {
    contextGathering: {
      completedAt: jokeContextResult.completedAt,
      jokeContextSnapshot: jokeContextResult.jokeContextSnapshot,
      startedAt: jokeContextResult.startedAt,
      status: "completed",
    },
    imageGeneration: {
      status: "not-started",
    },
    newsLinkedImageDiscovery: {
      status: "not-started",
    },
    textGeneration: {
      status: "not-started",
    },
  };
}

function buildContextGatheringFailedStates(
  jokeContextResult: Extract<
    Awaited<ReturnType<typeof retrieveJokeContextSnapshot>>,
    { status: "failed" }
  >,
): GenerationResultStates {
  return {
    contextGathering: {
      debugLog: jokeContextResult.debugLog,
      failedAt: jokeContextResult.failedAt,
      message: jokeContextResult.message,
      startedAt: jokeContextResult.startedAt,
      status: "failed",
    },
    imageGeneration: {
      status: "not-started",
    },
    newsLinkedImageDiscovery: {
      status: "not-started",
    },
    textGeneration: {
      status: "not-started",
    },
  };
}

function buildCreativeBranchesRunningStates({
  jokeContextResult,
  newsLinkedImageDiscoveryStartedAt,
  textGenerationStartedAt,
}: {
  jokeContextResult: Extract<
    Awaited<ReturnType<typeof retrieveJokeContextSnapshot>>,
    { status: "completed" }
  >;
  newsLinkedImageDiscoveryStartedAt: string;
  textGenerationStartedAt: string;
}): GenerationResultStates {
  return {
    contextGathering: {
      completedAt: jokeContextResult.completedAt,
      jokeContextSnapshot: jokeContextResult.jokeContextSnapshot,
      startedAt: jokeContextResult.startedAt,
      status: "completed",
    },
    imageGeneration: {
      status: "not-started",
    },
    newsLinkedImageDiscovery: {
      startedAt: newsLinkedImageDiscoveryStartedAt,
      status: "running",
    },
    textGeneration: {
      startedAt: textGenerationStartedAt,
      status: "running",
    },
  };
}

function buildTerminalGenerationResultStates({
  jokeContextResult,
  newsLinkedImageDiscoveryResult,
  textGeneration,
}: {
  jokeContextResult: Extract<
    Awaited<ReturnType<typeof retrieveJokeContextSnapshot>>,
    { status: "completed" }
  >;
  newsLinkedImageDiscoveryResult: Awaited<ReturnType<typeof retrieveNewsLinkedImageDiscovery>>;
  textGeneration: GenerationResultStates["textGeneration"];
}): GenerationResultStates {
  return {
    contextGathering: {
      completedAt: jokeContextResult.completedAt,
      jokeContextSnapshot: jokeContextResult.jokeContextSnapshot,
      startedAt: jokeContextResult.startedAt,
      status: "completed",
    },
    imageGeneration: {
      status: "not-started",
    },
    newsLinkedImageDiscovery:
      newsLinkedImageDiscoveryResult.status === "available"
        ? {
            completedAt: newsLinkedImageDiscoveryResult.completedAt,
            newsLinkedImages: newsLinkedImageDiscoveryResult.newsLinkedImages,
            startedAt: newsLinkedImageDiscoveryResult.startedAt,
            status: "completed",
          }
        : {
            failedAt: newsLinkedImageDiscoveryResult.failedAt,
            message: newsLinkedImageDiscoveryResult.message,
            startedAt: newsLinkedImageDiscoveryResult.startedAt,
            status: "failed",
          },
    textGeneration,
  };
}

function buildCompletedGenerationResultStates({
  completedRun,
  jokeContextResult,
  newsLinkedImageDiscoveryResult,
  textGenerationCompletedAt,
  textGenerationStartedAt,
}: {
  completedRun: CompletedGenerationRunPayload;
  jokeContextResult: Extract<
    Awaited<ReturnType<typeof retrieveJokeContextSnapshot>>,
    { status: "completed" }
  >;
  newsLinkedImageDiscoveryResult: Awaited<ReturnType<typeof retrieveNewsLinkedImageDiscovery>>;
  textGenerationCompletedAt: string;
  textGenerationStartedAt: string;
}): GenerationResultStates {
  return buildTerminalGenerationResultStates({
    jokeContextResult,
    newsLinkedImageDiscoveryResult,
    textGeneration: completedRun.generationResultStates?.textGeneration ?? {
      completedAt: textGenerationCompletedAt,
      draftCount: draftTarget,
      startedAt: textGenerationStartedAt,
      status: "completed",
    },
  });
}

function buildGenerationRunLabel(sourceTweetUrl: string) {
  const statusId = sourceTweetUrl.match(/status\/([^/?#]+)/)?.[1] ?? "tweet";

  return `Drafts for ${statusId}`;
}
