import type { OutsideXEnrichmentContext } from "@/features/enrichment/outside-x-enrichment";
import {
  buildReplySignals,
  type OutsideXEnrichmentService,
  OutsideXEnrichmentUnavailableError,
  retrieveOutsideXEnrichment,
} from "@/features/enrichment/outside-x-enrichment";
import {
  buildCompletedGenerationRunEvents,
  buildEnrichmentCompletedEvent,
  buildGenerationFailureEvent,
  parseGenerationStreamEvent,
} from "@/features/generation/generation-events";
import {
  type GenerationOrchestrator,
  orchestrateThreeProviderGeneration,
} from "@/features/generation/generation-orchestrator";
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
    orchestrateGeneration?: GenerationOrchestrator;
    retrieveOutsideXEnrichment?: OutsideXEnrichmentService;
    retrieveTweetContext?: TweetRetrievalService;
  } = {},
) {
  const requestUrl = new URL(request.url);
  const sourceTweetUrl = requestUrl.searchParams.get("sourceTweetUrl") ?? "";
  const usersDirection = requestUrl.searchParams.get("usersDirection") ?? "";
  const encoder = new TextEncoder();
  const retrieve = dependencies.retrieveTweetContext ?? retrieveTweetContext;
  const enrich =
    dependencies.retrieveOutsideXEnrichment ?? retrieveOutsideXEnrichment;
  const orchestrate =
    dependencies.orchestrateGeneration ?? orchestrateThreeProviderGeneration;
  const events = await buildGenerationRunEvents({
    enrich,
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
            `event: ${validatedEvent.type}\ndata: ${JSON.stringify(
              validatedEvent,
            )}\n\n`,
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
  enrich,
  orchestrate,
  retrieve,
  sourceTweetUrl,
  usersDirection,
}: {
  enrich: OutsideXEnrichmentService;
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
  const enrichmentResult = await retrieveMandatoryOutsideXEnrichment({
    enrich,
    replySignals,
    sourceTweet: tweetContext.sourceTweet,
    usersDirection,
  });

  if (enrichmentResult.status === "failed") {
    return [
      buildGenerationFailureEvent(
        "Outside-X enrichment could not provide news-linked images.",
      ),
    ];
  }
  const enrichmentContext =
    enrichmentResult.status === "available"
      ? enrichmentResult.enrichmentContext
      : undefined;

  try {
    const completedRun = await orchestrate({
      enrichmentContext,
      replySignals,
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl,
      usersDirection,
    });
    const completedEvents = buildCompletedGenerationRunEvents({
      run: completedRun,
    });

    if (!enrichmentContext) {
      return completedEvents;
    }

    return [
      buildEnrichmentCompletedEvent({
        newsLinkedImages: enrichmentContext.newsLinkedImages,
        sourceTweet: tweetContext.sourceTweet,
      }),
      ...completedEvents,
    ];
  } catch (error) {
    console.error("Generation orchestration failed.", error);

    return [
      buildGenerationFailureEvent(
        "Draft providers could not complete a three-draft run.",
      ),
    ];
  }
}

async function retrieveMandatoryOutsideXEnrichment({
  enrich,
  replySignals,
  sourceTweet,
  usersDirection,
}: Parameters<OutsideXEnrichmentService>[0] & {
  enrich: OutsideXEnrichmentService;
}): Promise<
  | {
      enrichmentContext: OutsideXEnrichmentContext;
      status: "available";
    }
  | {
      status: "failed";
    }
  | {
      status: "unavailable-in-development";
    }
> {
  try {
    const enrichmentContext = await enrich({
      replySignals,
      sourceTweet,
      usersDirection,
    });

    if (enrichmentContext.newsLinkedImages.length === 0) {
      return {
        status: "failed",
      };
    }

    return {
      enrichmentContext,
      status: "available",
    };
  } catch (error) {
    if (
      error instanceof OutsideXEnrichmentUnavailableError &&
      process.env.NODE_ENV !== "production"
    ) {
      return {
        status: "unavailable-in-development",
      };
    }

    return {
      status: "failed",
    };
  }
}
