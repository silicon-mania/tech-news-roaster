import { buildReplySignals } from "@/features/enrichment/outside-x-enrichment";
import {
  buildCompletedGenerationRunEvents,
  buildEnrichmentCompletedEvent,
  buildGenerationFailureEvent,
  type GenerationResultStates,
  type JokeContextSnapshot,
  type NewsLinkedImage,
  parseGenerationStreamEvent,
} from "@/features/generation/generation-events";
import {
  type GenerationOrchestrator,
  orchestrateThreeProviderGeneration,
} from "@/features/generation/generation-orchestrator";
import {
  gatherJokeContext,
  JokeContextGatheringError,
  type JokeContextGatheringInput,
} from "@/features/joke-context-gathering/joke-context-gathering";
import {
  discoverNewsLinkedImages,
  type NewsLinkedImageDiscoveryService,
  NewsLinkedImageDiscoveryUnavailableError,
} from "@/features/news-linked-image-discovery/news-linked-image-discovery";
import {
  retrieveTweetContext,
  TweetRetrievalError,
  type TweetRetrievalService,
} from "@/features/tweet-retrieval/tweet-retrieval";

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

  const replySignals = buildReplySignals(tweetContext);
  const jokeContextResult = await retrieveJokeContextSnapshot({
    gather,
    tweetContext,
  });

  if (jokeContextResult.status === "failed") {
    return [buildGenerationFailureEvent(jokeContextResult.message)];
  }

  const newsLinkedImageDiscoveryResult = await retrieveNewsLinkedImageDiscovery({
    discover,
    replySignals,
    sourceTweet: tweetContext.sourceTweet,
    usersDirection,
  });
  const textGenerationStartedAt = new Date().toISOString();

  try {
    const completedRun = await orchestrate({
      replySignals,
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl,
      usersDirection,
    });
    const textGenerationCompletedAt = new Date().toISOString();
    const completedEvents = buildCompletedGenerationRunEvents({
      run: {
        ...completedRun,
        generationResultStates: buildInitialGenerationResultStates({
          jokeContextResult,
          newsLinkedImageDiscoveryResult,
          textGenerationCompletedAt,
          textGenerationStartedAt,
        }),
        jokeContextSnapshot: jokeContextResult.jokeContextSnapshot,
        newsLinkedImages:
          newsLinkedImageDiscoveryResult.status === "available"
            ? newsLinkedImageDiscoveryResult.newsLinkedImages
            : undefined,
      },
    });

    if (newsLinkedImageDiscoveryResult.status !== "available") {
      return completedEvents;
    }

    return [
      buildEnrichmentCompletedEvent({
        newsLinkedImages: newsLinkedImageDiscoveryResult.newsLinkedImages,
        sourceTweet: tweetContext.sourceTweet,
      }),
      ...completedEvents,
    ];
  } catch (error) {
    console.error("Generation orchestration failed.", error);

    return [buildGenerationFailureEvent("Draft providers could not complete a three-draft run.")];
  }
}

async function retrieveJokeContextSnapshot({
  gather,
  tweetContext,
}: JokeContextGatheringInput & {
  gather: (input: JokeContextGatheringInput) => Promise<JokeContextSnapshot>;
}): Promise<
  | {
      completedAt: string;
      jokeContextSnapshot: JokeContextSnapshot;
      startedAt: string;
      status: "completed";
    }
  | {
      message: string;
      status: "failed";
    }
> {
  const startedAt = new Date().toISOString();

  try {
    const jokeContextSnapshot = await gather({ tweetContext });

    return {
      completedAt: new Date().toISOString(),
      jokeContextSnapshot,
      startedAt,
      status: "completed",
    };
  } catch (error) {
    const message =
      error instanceof JokeContextGatheringError
        ? error.userMessage
        : "Joke context gathering could not form usable context.";

    return {
      message,
      status: "failed",
    };
  }
}

async function retrieveNewsLinkedImageDiscovery({
  discover,
  replySignals,
  sourceTweet,
  usersDirection,
}: Parameters<NewsLinkedImageDiscoveryService>[0] & {
  discover: NewsLinkedImageDiscoveryService;
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
  const startedAt = new Date().toISOString();

  try {
    const discoveryResult = await discover({
      replySignals,
      sourceTweet,
      usersDirection,
    });

    if (discoveryResult.newsLinkedImages.length === 0) {
      return {
        failedAt: new Date().toISOString(),
        message: "News-linked image discovery could not find qualifying images.",
        startedAt,
        status: "failed",
      };
    }

    return {
      completedAt: new Date().toISOString(),
      newsLinkedImages: discoveryResult.newsLinkedImages,
      startedAt,
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
        startedAt,
        status: "failed",
      };
    }

    return {
      failedAt: new Date().toISOString(),
      message: "News-linked image discovery could not find qualifying images.",
      startedAt,
      status: "failed",
    };
  }
}

function buildInitialGenerationResultStates({
  jokeContextResult,
  newsLinkedImageDiscoveryResult,
  textGenerationCompletedAt,
  textGenerationStartedAt,
}: {
  jokeContextResult: Extract<
    Awaited<ReturnType<typeof retrieveJokeContextSnapshot>>,
    { status: "completed" }
  >;
  newsLinkedImageDiscoveryResult: Awaited<ReturnType<typeof retrieveNewsLinkedImageDiscovery>>;
  textGenerationCompletedAt: string;
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
    textGeneration: {
      completedAt: textGenerationCompletedAt,
      draftCount: 3,
      startedAt: textGenerationStartedAt,
      status: "completed",
    },
    visualJokeGeneration: {
      status: "not-started",
    },
  };
}
