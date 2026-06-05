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
  dependencies: { retrieveTweetContext?: TweetRetrievalService } = {},
) {
  const requestUrl = new URL(request.url);
  const sourceTweetUrl = requestUrl.searchParams.get("sourceTweetUrl") ?? "";
  const usersDirection = requestUrl.searchParams.get("usersDirection") ?? "";
  const encoder = new TextEncoder();
  const retrieve = dependencies.retrieveTweetContext ?? retrieveTweetContext;
  const events = await buildGenerationRunEvents({
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
  retrieve,
  sourceTweetUrl,
  usersDirection,
}: {
  retrieve: TweetRetrievalService;
  sourceTweetUrl: string;
  usersDirection: string;
}) {
  try {
    const tweetContext = await retrieve({ sourceTweetUrl });

    return buildStubbedGenerationEvents({
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
