import {
  buildReplySignals,
  type OutsideXEnrichmentService,
  retrieveOutsideXEnrichment,
  shouldEnrichOutsideX,
} from "@/features/enrichment/outside-x-enrichment";
import {
  buildGenerationFailureEvent,
  buildStubbedGenerationEvents,
  parseGenerationStreamEvent,
} from "@/features/generation/generation-events";
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
  const events = await buildGenerationRunEvents({
    enrich,
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
  retrieve,
  sourceTweetUrl,
  usersDirection,
}: {
  enrich: OutsideXEnrichmentService;
  retrieve: TweetRetrievalService;
  sourceTweetUrl: string;
  usersDirection: string;
}) {
  try {
    const tweetContext = await retrieve({ sourceTweetUrl });
    const replySignals = buildReplySignals(tweetContext);
    const enrichmentContext = shouldEnrichOutsideX(tweetContext)
      ? await retrieveOptionalOutsideXEnrichment({
          enrich,
          replySignals,
          sourceTweet: tweetContext.sourceTweet,
          usersDirection,
        })
      : undefined;

    return buildStubbedGenerationEvents({
      enrichmentContext,
      replySignals,
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl,
      usersDirection,
    });
  } catch (error) {
    const message =
      error instanceof TweetRetrievalError
        ? error.userMessage
        : "Source tweet could not be retrieved.";

    return [buildGenerationFailureEvent(message)];
  }
}

async function retrieveOptionalOutsideXEnrichment({
  enrich,
  replySignals,
  sourceTweet,
  usersDirection,
}: Parameters<OutsideXEnrichmentService>[0] & {
  enrich: OutsideXEnrichmentService;
}) {
  try {
    return await enrich({
      replySignals,
      sourceTweet,
      usersDirection,
    });
  } catch {
    return undefined;
  }
}
