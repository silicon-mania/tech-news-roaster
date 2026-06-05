import { z } from "zod";
import type {
  RetrievedSourceTweet,
  RetrievedTweetContext,
} from "@/features/tweet-retrieval/tweet-retrieval";

const minimumSourceTweetCharacters = 120;
const minimumReplySignals = 2;
const minimumReplyCharacters = 80;
const maxReplySignals = 6;

const replySignalSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    engagementScore: z.number().int().nonnegative(),
  })
  .strict();

const outsideXEnrichmentItemSchema = z
  .object({
    title: z.string().min(1),
    summary: z.string().min(1),
    url: z.string().url().optional(),
  })
  .strict();

const outsideXEnrichmentContextSchema = z
  .object({
    retrievedAt: z.string().datetime(),
    items: z.array(outsideXEnrichmentItemSchema).max(5),
  })
  .strict();

export type ReplySignal = z.infer<typeof replySignalSchema>;
export type OutsideXEnrichmentContext = z.infer<
  typeof outsideXEnrichmentContextSchema
>;

export type OutsideXEnrichmentInput = {
  sourceTweet: RetrievedSourceTweet;
  replySignals: ReplySignal[];
  usersDirection: string;
};

export type OutsideXEnrichmentService = (
  input: OutsideXEnrichmentInput,
) => Promise<OutsideXEnrichmentContext>;

export function buildReplySignals(
  tweetContext: RetrievedTweetContext,
): ReplySignal[] {
  return tweetContext.replies
    .map((reply) =>
      replySignalSchema.parse({
        id: reply.id,
        text: reply.text,
        engagementScore:
          reply.metrics.likes +
          reply.metrics.quotes +
          reply.metrics.reposts +
          reply.metrics.replies,
      }),
    )
    .sort((left, right) => right.engagementScore - left.engagementScore)
    .slice(0, maxReplySignals);
}

export function shouldEnrichOutsideX({
  sourceTweet,
  replies,
}: RetrievedTweetContext) {
  const sourceTweetCharacters = sourceTweet.text.trim().length;
  const replyCharacters = replies.reduce(
    (total, reply) => total + reply.text.trim().length,
    0,
  );

  return (
    sourceTweetCharacters < minimumSourceTweetCharacters ||
    replies.length < minimumReplySignals ||
    replyCharacters < minimumReplyCharacters
  );
}

export async function retrieveOutsideXEnrichment({
  sourceTweet,
  replySignals,
  usersDirection,
}: OutsideXEnrichmentInput): Promise<OutsideXEnrichmentContext> {
  const endpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;

  if (!endpoint) {
    return outsideXEnrichmentContextSchema.parse({
      retrievedAt: new Date(0).toISOString(),
      items: [],
    });
  }

  const response = await fetch(endpoint, {
    body: JSON.stringify({
      sourceTweet,
      replySignals,
      usersDirection,
    }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    return outsideXEnrichmentContextSchema.parse({
      retrievedAt: new Date(0).toISOString(),
      items: [],
    });
  }

  return outsideXEnrichmentContextSchema.parse(await response.json());
}
