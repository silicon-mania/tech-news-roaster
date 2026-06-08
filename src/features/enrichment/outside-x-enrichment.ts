import { z } from "zod";
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

const newsLinkedImageSchema = rawNewsLinkedImageSchema
  .extend({
    id: z.string().min(1),
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

export async function retrieveOutsideXEnrichment({
  sourceTweet,
  replySignals,
  usersDirection,
}: OutsideXEnrichmentInput): Promise<OutsideXEnrichmentContext> {
  const endpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;

  if (!endpoint) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Outside-X enrichment endpoint is not configured.");
    }

    return buildFixtureOutsideXEnrichment(sourceTweet);
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
    throw new Error(`Outside-X enrichment failed (${response.status}).`);
  }

  return normalizeOutsideXEnrichmentContext(await response.json());
}

function normalizeOutsideXEnrichmentContext(
  payload: unknown,
): OutsideXEnrichmentContext {
  const rawContext = rawOutsideXEnrichmentContextSchema.parse(payload);

  return outsideXEnrichmentContextSchema.parse({
    ...rawContext,
    newsLinkedImages: rawContext.newsLinkedImages.map((image, index) => ({
      ...image,
      id: `news-linked-image-${index + 1}`,
    })),
  });
}

function buildFixtureOutsideXEnrichment(
  sourceTweet: RetrievedSourceTweet,
): OutsideXEnrichmentContext {
  return outsideXEnrichmentContextSchema.parse({
    retrievedAt: new Date(0).toISOString(),
    items: [
      {
        title: "Local outside-X context",
        summary:
          "Local development context keeps mandatory enrichment available without an external provider.",
        url: "https://example.com/local-outside-x-context",
      },
    ],
    newsLinkedImages: [
      {
        id: "news-linked-image-1",
        url: `https://example.com/news-linked-images/${sourceTweet.id}.jpg`,
        altText: "News-linked visual candidate for the source tweet.",
        sourceUrl: sourceTweet.url,
        title: "Source news visual",
      },
    ],
  });
}
