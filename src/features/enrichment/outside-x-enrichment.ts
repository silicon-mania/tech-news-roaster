import { z } from "zod";
import { newsLinkedImageSchema } from "@/features/generation/generation-events";
import type {
  RetrievedSourceTweet,
  RetrievedTweetContext,
} from "@/features/tweet-retrieval/tweet-retrieval";

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

const rawNewsLinkedImageSchema = z
  .object({
    id: z.string().min(1).optional(),
    url: z.string().url(),
    altText: z.string().min(1).optional(),
    sourceUrl: z.string().url().optional(),
    title: z.string().min(1).optional(),
  })
  .strict();

const rawOutsideXEnrichmentContextSchema = z
  .object({
    retrievedAt: z.string().datetime(),
    items: z.array(outsideXEnrichmentItemSchema).min(1).max(5),
    newsLinkedImages: z.array(rawNewsLinkedImageSchema).min(1).max(5),
  })
  .strict();

const outsideXEnrichmentContextSchema = z
  .object({
    retrievedAt: z.string().datetime(),
    items: z.array(outsideXEnrichmentItemSchema).min(1).max(5),
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5),
  })
  .strict();

export type ReplySignal = z.infer<typeof replySignalSchema>;
export type OutsideXEnrichmentContext = z.infer<typeof outsideXEnrichmentContextSchema>;

export type OutsideXEnrichmentInput = {
  sourceTweet: RetrievedSourceTweet;
  replySignals: ReplySignal[];
  usersDirection: string;
};

export type OutsideXEnrichmentService = (
  input: OutsideXEnrichmentInput,
) => Promise<OutsideXEnrichmentContext>;

export class OutsideXEnrichmentUnavailableError extends Error {
  constructor(message = "Outside-X enrichment endpoint is not configured.") {
    super(message);
    this.name = "OutsideXEnrichmentUnavailableError";
  }
}

export function buildReplySignals(tweetContext: RetrievedTweetContext): ReplySignal[] {
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

export async function retrieveOutsideXEnrichment({
  sourceTweet,
  replySignals,
  usersDirection,
}: OutsideXEnrichmentInput): Promise<OutsideXEnrichmentContext> {
  const endpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;

  if (!endpoint) {
    throw new OutsideXEnrichmentUnavailableError();
  }
  const apiKey = process.env.OUTSIDE_X_ENRICHMENT_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Outside-X enrichment API key is not configured.");
  }

  const response = await fetch(endpoint, {
    body: JSON.stringify({
      sourceTweet,
      replySignals,
      usersDirection,
    }),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Outside-X enrichment failed (${response.status}).`);
  }

  return normalizeOutsideXEnrichmentContext(await response.json());
}

function normalizeOutsideXEnrichmentContext(payload: unknown): OutsideXEnrichmentContext {
  const rawContext = rawOutsideXEnrichmentContextSchema.parse(payload);

  return outsideXEnrichmentContextSchema.parse({
    ...rawContext,
    newsLinkedImages: rawContext.newsLinkedImages.map((image, index) => ({
      ...image,
      id: `news-linked-image-${index + 1}`,
    })),
  });
}
