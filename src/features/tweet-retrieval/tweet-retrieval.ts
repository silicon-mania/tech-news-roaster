import { z } from "zod";

const retrievalFailureMessage = "Source tweet could not be retrieved.";
const twitterApiBaseUrl = "https://api.twitterapi.io";
const maxReplyPages = 2;
const maxReplies = 40;

const tweetAuthorSchema = z
  .object({
    username: z.string().min(1),
    displayName: z.string().min(1),
  })
  .strict();

const tweetMetricsSchema = z
  .object({
    replies: z.number().int().nonnegative(),
    reposts: z.number().int().nonnegative(),
    quotes: z.number().int().nonnegative(),
    likes: z.number().int().nonnegative(),
    views: z.number().int().nonnegative(),
  })
  .strict();

export const retrievedSourceTweetSchema = z
  .object({
    id: z.string().min(1),
    url: z.string().url(),
    text: z.string().min(1),
    createdAt: z.string().datetime(),
    author: tweetAuthorSchema,
    metrics: tweetMetricsSchema,
  })
  .strict();

const retrievedReplySchema = retrievedSourceTweetSchema.omit({ url: true });

const retrievedTweetContextSchema = z
  .object({
    sourceTweet: retrievedSourceTweetSchema,
    replies: z.array(retrievedReplySchema).max(maxReplies),
  })
  .strict();

export type RetrievedSourceTweet = z.infer<typeof retrievedSourceTweetSchema>;
export type RetrievedTweetContext = z.infer<typeof retrievedTweetContextSchema>;
export type TweetRetrievalInput = {
  sourceTweetUrl: string;
};
export type TweetRetrievalService = (
  input: TweetRetrievalInput,
) => Promise<RetrievedTweetContext>;

type TwitterApiIoOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
};

type RawRecord = Record<string, unknown>;

export class TweetRetrievalError extends Error {
  readonly userMessage = retrievalFailureMessage;

  constructor(message = retrievalFailureMessage) {
    super(message);
    this.name = "TweetRetrievalError";
  }
}

export async function retrieveTweetContext(
  input: TweetRetrievalInput,
): Promise<RetrievedTweetContext> {
  const apiKey = process.env.TWITTERAPI_IO_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new TweetRetrievalError();
    }

    return buildFixtureTweetContext(input.sourceTweetUrl);
  }

  return retrieveWithTwitterApiIo(input, { apiKey });
}

async function retrieveWithTwitterApiIo(
  { sourceTweetUrl }: TweetRetrievalInput,
  { apiKey, fetcher = fetch }: TwitterApiIoOptions = {},
): Promise<RetrievedTweetContext> {
  if (!apiKey) {
    throw new TweetRetrievalError();
  }

  const tweetId = extractTweetId(sourceTweetUrl);
  const sourcePayload = await fetchJson(
    `${twitterApiBaseUrl}/twitter/tweets?tweet_ids=${encodeURIComponent(
      tweetId,
    )}`,
    apiKey,
    fetcher,
  );
  const sourceRecord = extractFirstTweetRecord(sourcePayload);

  if (!sourceRecord) {
    throw new TweetRetrievalError("Source tweet payload was empty.");
  }

  const sourceTweet = normalizeSourceTweet(sourceRecord, sourceTweetUrl);
  const replies = await retrieveReplies(tweetId, apiKey, fetcher);

  return retrievedTweetContextSchema.parse({
    sourceTweet,
    replies,
  });
}

export function buildFixtureTweetContext(
  sourceTweetUrl: string,
): RetrievedTweetContext {
  const tweetId = extractTweetId(sourceTweetUrl);

  return retrievedTweetContextSchema.parse({
    sourceTweet: {
      id: tweetId,
      url: sourceTweetUrl,
      text: "OpenAI just shipped an agent workspace for product teams, and every incumbent suddenly has to explain why their roadmap still looks like a settings page.",
      createdAt: "2026-06-05T10:00:00.000Z",
      author: {
        username: "siliconmania",
        displayName: "Silicon Mania",
      },
      metrics: {
        replies: 12,
        reposts: 8,
        quotes: 4,
        likes: 240,
        views: 19_000,
      },
    },
    replies: [
      {
        id: `${tweetId}-reply-1`,
        text: "The interesting part is less the UI and more the workflow lock-in.",
        createdAt: "2026-06-05T10:04:00.000Z",
        author: {
          username: "reply_one",
          displayName: "Reply One",
        },
        metrics: {
          replies: 0,
          reposts: 0,
          quotes: 0,
          likes: 11,
          views: 700,
        },
      },
      {
        id: `${tweetId}-reply-2`,
        text: "Feels like the product surface is becoming the moat.",
        createdAt: "2026-06-05T10:07:00.000Z",
        author: {
          username: "reply_two",
          displayName: "Reply Two",
        },
        metrics: {
          replies: 0,
          reposts: 0,
          quotes: 0,
          likes: 7,
          views: 480,
        },
      },
    ],
  });
}

function extractTweetId(sourceTweetUrl: string) {
  const parsedUrl = new URL(sourceTweetUrl);
  const match = parsedUrl.pathname.match(/\/status\/(\d+)/);

  if (!match) {
    throw new TweetRetrievalError("Source tweet URL did not contain an ID.");
  }

  return match[1];
}

async function retrieveReplies(
  tweetId: string,
  apiKey: string,
  fetcher: typeof fetch,
) {
  const replies: RetrievedTweetContext["replies"] = [];
  let cursor: string | null = null;

  try {
    for (let page = 0; page < maxReplyPages; page += 1) {
      const url = new URL(`${twitterApiBaseUrl}/twitter/tweet/replies/v2`);

      url.searchParams.set("tweetId", tweetId);
      url.searchParams.set("queryType", "Relevance");

      if (cursor) {
        url.searchParams.set("cursor", cursor);
      }

      const payload = await fetchJson(url.toString(), apiKey, fetcher);
      const pageReplies = extractTweetRecords(payload)
        .map((record) => normalizeReply(record))
        .slice(0, maxReplies - replies.length);

      replies.push(...pageReplies);

      cursor = readString(payload, ["next_cursor", "nextCursor", "cursor"]);

      if (!cursor || replies.length >= maxReplies) {
        break;
      }
    }
  } catch {
    return [];
  }

  return replies;
}

async function fetchJson(url: string, apiKey: string, fetcher: typeof fetch) {
  const response = await fetcher(url, {
    headers: {
      "X-API-Key": apiKey,
      "x-api-key": apiKey,
    },
  });

  if (!response.ok) {
    throw new TweetRetrievalError();
  }

  return response.json() as Promise<unknown>;
}

function extractFirstTweetRecord(payload: unknown) {
  return extractTweetRecords(payload).at(0) ?? null;
}

function extractTweetRecords(payload: unknown): RawRecord[] {
  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["tweets", "replies", "data"]) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }

    if (isRecord(value)) {
      const nestedRecords = extractTweetRecords(value);

      if (nestedRecords.length > 0) {
        return nestedRecords;
      }
    }
  }

  for (const key of ["tweet", "result"]) {
    const value = payload[key];

    if (isRecord(value)) {
      return [value];
    }
  }

  return [];
}

function normalizeSourceTweet(
  record: RawRecord,
  fallbackUrl: string,
): RetrievedSourceTweet {
  return retrievedSourceTweetSchema.parse({
    ...normalizeTweetBase(record),
    url: readString(record, ["url", "tweetUrl"]) ?? fallbackUrl,
  });
}

function normalizeReply(
  record: RawRecord,
): RetrievedTweetContext["replies"][0] {
  return retrievedReplySchema.parse(normalizeTweetBase(record));
}

function normalizeTweetBase(record: RawRecord) {
  const author = readRecord(record, ["author", "user"]) ?? {};

  return {
    id: readString(record, ["id", "id_str", "tweetId"]) ?? "unknown",
    text:
      readString(record, ["text", "full_text", "tweetText", "content"]) ?? "",
    createdAt:
      readString(record, ["createdAt", "created_at", "created_time"]) ??
      new Date(0).toISOString(),
    author: {
      username:
        readString(author, ["username", "userName", "screen_name"]) ??
        "unknown",
      displayName:
        readString(author, ["displayName", "name", "fullName"]) ?? "Unknown",
    },
    metrics: {
      replies: readNumber(record, ["replyCount", "replies", "reply_count"]),
      reposts: readNumber(record, ["retweetCount", "reposts", "retweets"]),
      quotes: readNumber(record, ["quoteCount", "quotes", "quote_count"]),
      likes: readNumber(record, ["likeCount", "likes", "favorite_count"]),
      views: readNumber(record, ["viewCount", "views", "impression_count"]),
    },
  };
}

function readRecord(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (isRecord(value)) {
      return value;
    }
  }

  return null;
}

function readString(record: unknown, keys: string[]) {
  if (!isRecord(record)) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }

    if (typeof value === "number") {
      return String(value);
    }
  }

  return null;
}

function readNumber(record: RawRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.max(0, Math.floor(value));
    }

    if (typeof value === "string") {
      const parsedValue = Number.parseInt(value, 10);

      if (Number.isFinite(parsedValue)) {
        return Math.max(0, parsedValue);
      }
    }
  }

  return 0;
}

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
