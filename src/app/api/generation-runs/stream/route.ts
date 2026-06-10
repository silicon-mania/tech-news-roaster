import {
  buildCompletedGenerationRunEvents,
  buildEnrichmentCompletedEvent,
  buildGenerationFailureEvent,
  buildGenerationRunStateEvent,
  type CompletedGenerationRunPayload,
  draftTarget,
  type GenerationResultStates,
  type JokeContextSnapshot,
  type NewsLinkedImage,
  parseCompletedGenerationRunPayload,
  parseGenerationStreamEvent,
} from "@/services/generation/generation-events";
import {
  type GenerationOrchestrator,
  orchestrateThreeProviderGeneration,
} from "@/services/generation/generation-orchestrator";
import {
  gatherJokeContext,
  JokeContextGatheringError,
  type JokeContextGatheringInput,
} from "@/services/joke-context-gathering";
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
  const discover = dependencies.discoverNewsLinkedImages ?? discoverNewsLinkedImages;
  const gather = dependencies.gatherJokeContext ?? gatherJokeContext;
  const retrieve = dependencies.retrieveTweetContext ?? retrieveTweetContext;
  const orchestrate = dependencies.orchestrateGeneration ?? orchestrateThreeProviderGeneration;
  const events = await buildGenerationRunEvents({
    discover,
    gather,
    orchestrate,
    retrieve,
    sourceTweetUrl,
    usersDirection,
  });

  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) {
        const validatedEvent = parseGenerationStreamEvent(event);

        controller.enqueue(
          encoder.encode(
            `event: ${validatedEvent.type}\ndata: ${JSON.stringify(validatedEvent)}\n\n`,
          ),
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

async function buildGenerationRunEvents({
  discover,
  gather,
  orchestrate,
  retrieve,
  sourceTweetUrl,
  usersDirection,
}: {
  discover: NewsLinkedImageDiscoveryService;
  gather: (input: JokeContextGatheringInput) => Promise<JokeContextSnapshot>;
  orchestrate: GenerationOrchestrator;
  retrieve: TweetRetrievalService;
  sourceTweetUrl: string;
  usersDirection: string;
}) {
  let tweetContext: Awaited<ReturnType<TweetRetrievalService>>;

  try {
    tweetContext = await retrieve({ sourceTweetUrl });
  } catch (error) {
    const message =
      error instanceof TweetRetrievalError
        ? error.userMessage
        : "Source tweet could not be retrieved.";

    return [buildGenerationFailureEvent(message)];
  }

  const runLabel = buildGenerationRunLabel(sourceTweetUrl);
  const contextGatheringStartedAt = new Date().toISOString();
  const events = [
    buildGenerationRunStateEvent({
      generationResultStates: buildContextGatheringRunningStates(contextGatheringStartedAt),
      label: runLabel,
      sourceTweet: tweetContext.sourceTweet,
    }),
  ];
  const replySignals = buildReplySignals(tweetContext);
  const jokeContextResult = await retrieveJokeContextSnapshot({
    gather,
    startedAt: contextGatheringStartedAt,
    tweetContext,
  });

  if (jokeContextResult.status === "failed") {
    events.push(
      buildGenerationRunStateEvent({
        generationResultStates: buildContextGatheringFailedStates(jokeContextResult),
        label: runLabel,
        sourceTweet: tweetContext.sourceTweet,
      }),
    );

    return [...events, buildGenerationFailureEvent(jokeContextResult.message)];
  }

  const contextCompletedStates = buildContextGatheringCompletedStates(jokeContextResult);

  events.push(
    buildGenerationRunStateEvent({
      generationResultStates: contextCompletedStates,
      label: runLabel,
      sourceTweet: tweetContext.sourceTweet,
    }),
  );

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
  });
  const [newsLinkedImageDiscoveryResult, generationResult] = await Promise.all([
    newsLinkedImageDiscoveryPromise,
    completedRunPromise
      .then((run) => ({ run, status: "fulfilled" as const }))
      .catch((error: unknown) => ({ error, status: "rejected" as const })),
  ]);

  const hasVisualJokeBranch =
    generationResult.status === "fulfilled" &&
    generationResult.run.generationResultStates?.visualJokeGeneration.status !== "not-started";
  const creativeBranchesRunningStates = buildCreativeBranchesRunningStates({
    jokeContextResult,
    newsLinkedImageDiscoveryStartedAt,
    textGenerationStartedAt,
    visualJokeStartedAt: hasVisualJokeBranch ? textGenerationStartedAt : undefined,
  });

  events.push(
    buildGenerationRunStateEvent({
      generationResultStates: creativeBranchesRunningStates,
      label: runLabel,
      sourceTweet: tweetContext.sourceTweet,
    }),
  );

  if (newsLinkedImageDiscoveryResult.status === "available") {
    events.push(
      buildEnrichmentCompletedEvent({
        newsLinkedImages: newsLinkedImageDiscoveryResult.newsLinkedImages,
        sourceTweet: tweetContext.sourceTweet,
      }),
    );
  }

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
      visualJokeGeneration: {
        status: "not-started",
      },
    });

    events.push(
      buildGenerationRunStateEvent({
        generationResultStates: terminalGenerationResultStates,
        label: runLabel,
        sourceTweet: tweetContext.sourceTweet,
      }),
    );

    if (newsLinkedImageDiscoveryResult.status === "available") {
      const completedRun = parseCompletedGenerationRunPayload({
        drafts: [],
        generationResultStates: terminalGenerationResultStates,
        jokeContextSnapshot: jokeContextResult.jokeContextSnapshot,
        label: runLabel,
        newsLinkedImages: newsLinkedImageDiscoveryResult.newsLinkedImages,
        sourceTweet: tweetContext.sourceTweet,
      });

      return [...events, ...buildCompletedGenerationRunEvents({ run: completedRun })];
    }

    return [
      ...events,
      buildGenerationFailureEvent("Draft providers could not complete a three-draft run."),
    ];
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
    jokeContextSnapshot: jokeContextResult.jokeContextSnapshot,
    label: generationResult.run.label,
    newsLinkedImages:
      newsLinkedImageDiscoveryResult.status === "available"
        ? newsLinkedImageDiscoveryResult.newsLinkedImages
        : undefined,
    sourceTweet: generationResult.run.sourceTweet,
  });

  if (completedRun.generationResultStates) {
    events.push(
      buildGenerationRunStateEvent({
        generationResultStates: completedRun.generationResultStates,
        label: completedRun.label,
        sourceTweet: completedRun.sourceTweet,
      }),
    );
  }

  return [...events, ...buildCompletedGenerationRunEvents({ run: completedRun })];
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
    visualJokeGeneration: {
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
    visualJokeGeneration: {
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
    visualJokeGeneration: {
      status: "not-started",
    },
  };
}

function buildCreativeBranchesRunningStates({
  jokeContextResult,
  newsLinkedImageDiscoveryStartedAt,
  textGenerationStartedAt,
  visualJokeStartedAt,
}: {
  jokeContextResult: Extract<
    Awaited<ReturnType<typeof retrieveJokeContextSnapshot>>,
    { status: "completed" }
  >;
  newsLinkedImageDiscoveryStartedAt: string;
  textGenerationStartedAt: string;
  visualJokeStartedAt?: string;
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
    visualJokeGeneration: visualJokeStartedAt
      ? {
          startedAt: visualJokeStartedAt,
          status: "running",
        }
      : {
          status: "not-started",
        },
  };
}

function buildTerminalGenerationResultStates({
  jokeContextResult,
  newsLinkedImageDiscoveryResult,
  textGeneration,
  visualJokeGeneration,
}: {
  jokeContextResult: Extract<
    Awaited<ReturnType<typeof retrieveJokeContextSnapshot>>,
    { status: "completed" }
  >;
  newsLinkedImageDiscoveryResult: Awaited<ReturnType<typeof retrieveNewsLinkedImageDiscovery>>;
  textGeneration: GenerationResultStates["textGeneration"];
  visualJokeGeneration: GenerationResultStates["visualJokeGeneration"];
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
    visualJokeGeneration,
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
    visualJokeGeneration: completedRun.generationResultStates?.visualJokeGeneration ?? {
      status: "not-started",
    },
  });
}

function buildGenerationRunLabel(sourceTweetUrl: string) {
  const statusId = sourceTweetUrl.match(/status\/([^/?#]+)/)?.[1] ?? "tweet";

  return `Drafts for ${statusId}`;
}
