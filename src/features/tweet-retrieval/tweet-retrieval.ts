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

export const sourceTweetMediaKindSchema = z.enum(["image", "video", "gif", "unknown"]);

const sourceTweetMediaReferenceSchema = z
  .object({
    id: z.string().min(1),
    kind: sourceTweetMediaKindSchema,
    url: z.string().url(),
    previewUrl: z.string().url().optional(),
    altText: z.string().min(1).optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationMs: z.number().int().nonnegative().optional(),
  })
  .strict();

const retrievedTweetBaseSchema = z
  .object({
    id: z.string().min(1),
    text: z.string().min(1),
    createdAt: z.string().datetime(),
    author: tweetAuthorSchema,
    metrics: tweetMetricsSchema,
  })
  .strict();

export const retrievedSourceTweetSchema = retrievedTweetBaseSchema
  .extend({
    url: z.string().url(),
    mediaReferences: z.array(sourceTweetMediaReferenceSchema),
  })
  .strict();

const retrievedReplySchema = retrievedTweetBaseSchema;

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
export type TweetRetrievalService = (input: TweetRetrievalInput) => Promise<RetrievedTweetContext>;

type TwitterApiIoOptions = {
  apiKey?: string;
  fetcher?: typeof fetch;
};

type RawRecord = Record<string, unknown>;
type SourceTweetMediaReference = z.infer<typeof sourceTweetMediaReferenceSchema>;

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
    `${twitterApiBaseUrl}/twitter/tweets?tweet_ids=${encodeURIComponent(tweetId)}`,
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

export function buildFixtureTweetContext(sourceTweetUrl: string): RetrievedTweetContext {
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
      mediaReferences: [
        {
          id: "fixture-media-1",
          kind: "image",
          url: "https://cdn.example.com/agent-workspace-hero.jpg",
          previewUrl: "https://cdn.example.com/agent-workspace-hero-preview.jpg",
          altText: "Product launch hero image.",
          width: 1600,
          height: 900,
        },
        {
          id: "fixture-media-2",
          kind: "image",
          url: "https://cdn.example.com/agent-workspace-screenshot.jpg",
          previewUrl: "https://cdn.example.com/agent-workspace-screenshot-preview.jpg",
          altText: "Screenshot of the new agent workspace UI.",
          width: 1440,
          height: 900,
        },
        {
          id: "fixture-media-3",
          kind: "video",
          url: "https://cdn.example.com/agent-workspace-demo.mp4",
          previewUrl: "https://cdn.example.com/agent-workspace-demo-poster.jpg",
          altText: "Short demo video of the agent workspace.",
          width: 1920,
          height: 1080,
          durationMs: 24_000,
        },
      ],
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

async function retrieveReplies(tweetId: string, apiKey: string, fetcher: typeof fetch) {
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
      "x-api-key": apiKey,
      Accept: "application/json",
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

function normalizeSourceTweet(record: RawRecord, fallbackUrl: string): RetrievedSourceTweet {
  return retrievedSourceTweetSchema.parse({
    ...normalizeTweetBase(record),
    url: readString(record, ["url", "tweetUrl"]) ?? fallbackUrl,
    mediaReferences: normalizeSourceTweetMediaReferences(record),
  });
}

function normalizeReply(record: RawRecord): RetrievedTweetContext["replies"][0] {
  return retrievedReplySchema.parse(normalizeTweetBase(record));
}

function normalizeTweetBase(record: RawRecord) {
  const author = readRecord(record, ["author", "user"]) ?? {};

  return {
    id: readString(record, ["id", "id_str", "tweetId"]) ?? "unknown",
    text: readString(record, ["text", "full_text", "tweetText", "content"]) ?? "",
    createdAt: normalizeCreatedAt(readString(record, ["createdAt", "created_at", "created_time"])),
    author: {
      username: readString(author, ["username", "userName", "screen_name"]) ?? "unknown",
      displayName: readString(author, ["displayName", "name", "fullName"]) ?? "Unknown",
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

function normalizeSourceTweetMediaReferences(record: RawRecord): SourceTweetMediaReference[] {
  const seenMediaReferenceIds = new Set<string>();
  const normalizedReferences: SourceTweetMediaReference[] = [];

  extractMediaRecords(record).forEach((mediaRecord, index) => {
    const normalizedReference = normalizeSourceTweetMediaReference(mediaRecord, index);

    if (!normalizedReference || seenMediaReferenceIds.has(normalizedReference.id)) {
      return;
    }

    seenMediaReferenceIds.add(normalizedReference.id);
    normalizedReferences.push(normalizedReference);
  });

  return normalizedReferences;
}

function normalizeSourceTweetMediaReference(
  record: RawRecord,
  index: number,
): SourceTweetMediaReference | null {
  const kind = normalizeSourceTweetMediaKind(readString(record, ["type", "mediaType", "kind"]));
  const directUrl =
    (kind === "video" || kind === "gif" ? selectMediaVariantUrl(record) : null) ??
    readString(record, [
      "media_url_https",
      "mediaUrlHttps",
      "media_url",
      "mediaUrl",
      "downloadUrl",
      "download_url",
      "assetUrl",
      "asset_url",
      "imageUrl",
      "image_url",
      "videoUrl",
      "video_url",
      "url",
    ]);

  if (!directUrl) {
    return null;
  }

  const previewUrl =
    readString(record, [
      "previewUrl",
      "preview_url",
      "previewImageUrl",
      "preview_image_url",
      "thumbnailUrl",
      "thumbnail_url",
      "posterUrl",
      "poster_url",
    ]) ?? readString(record, ["media_url_https", "mediaUrlHttps", "media_url", "mediaUrl"]);
  const originalInfo = readRecord(record, ["original_info", "originalInfo"]);
  const candidateReference = {
    id:
      readString(record, ["id", "mediaKey", "media_key", "key", "uuid"]) ??
      `source-tweet-media-${index + 1}`,
    kind,
    url: directUrl,
    previewUrl: previewUrl && previewUrl !== directUrl ? previewUrl : undefined,
    altText:
      readString(record, ["altText", "alt_text", "ext_alt_text", "alternativeText"]) ?? undefined,
    width:
      readOptionalPositiveInt(record, ["width", "originalWidth"]) ??
      readOptionalPositiveInt(originalInfo, ["width", "w"]),
    height:
      readOptionalPositiveInt(record, ["height", "originalHeight"]) ??
      readOptionalPositiveInt(originalInfo, ["height", "h"]),
    durationMs:
      readOptionalPositiveInt(record, ["durationMs", "duration_ms", "durationMillis"]) ??
      readOptionalPositiveInt(readRecord(record, ["video_info", "videoInfo"]), [
        "durationMillis",
        "duration_ms",
        "duration_millis",
      ]),
  };
  const normalizedReference = sourceTweetMediaReferenceSchema.safeParse(candidateReference);

  return normalizedReference.success ? normalizedReference.data : null;
}

function normalizeSourceTweetMediaKind(value: string | null): SourceTweetMediaReference["kind"] {
  if (!value) {
    return "unknown";
  }

  switch (value.toLowerCase()) {
    case "photo":
    case "image":
      return "image";
    case "animated_gif":
    case "gif":
      return "gif";
    case "video":
      return "video";
    default:
      return "unknown";
  }
}

function extractMediaRecords(record: RawRecord): RawRecord[] {
  const mediaCollections = [
    record.media,
    record.medias,
    record.mediaDetails,
    readRecord(record, ["extendedEntities", "extended_entities"]),
    readRecord(record, ["entities", "attachments"]),
  ];
  const collectedMediaRecords: RawRecord[] = [];

  for (const mediaCollection of mediaCollections) {
    collectedMediaRecords.push(...extractMediaRecordsFromValue(mediaCollection));
  }

  return collectedMediaRecords;
}

function extractMediaRecordsFromValue(value: unknown): RawRecord[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (!isRecord(value)) {
    return [];
  }

  for (const key of ["media", "medias", "mediaDetails", "items", "photos", "videos"]) {
    const nestedValue = value[key];

    if (Array.isArray(nestedValue)) {
      return nestedValue.filter(isRecord);
    }
  }

  for (const key of ["media", "photo", "image", "video", "gif"]) {
    const nestedValue = value[key];

    if (isRecord(nestedValue)) {
      return [nestedValue];
    }
  }

  return [];
}

function selectMediaVariantUrl(record: RawRecord) {
  const videoInfo = readRecord(record, ["video_info", "videoInfo"]);
  const variants = [videoInfo?.variants, record.variants].find(Array.isArray);

  if (!variants) {
    return null;
  }

  const variantRecords = variants.filter(isRecord).sort((left, right) => {
    const leftBitrate = readOptionalPositiveInt(left, ["bitrate"]) ?? 0;
    const rightBitrate = readOptionalPositiveInt(right, ["bitrate"]) ?? 0;

    return rightBitrate - leftBitrate;
  });

  for (const variant of variantRecords) {
    const contentType = readString(variant, ["content_type", "contentType"]);
    const url = readString(variant, ["url", "src"]);

    if (url && (!contentType || contentType.toLowerCase().includes("mp4"))) {
      return url;
    }
  }

  return null;
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

function readOptionalPositiveInt(record: unknown, keys: string[]) {
  if (!isRecord(record)) {
    return undefined;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      return Math.floor(value);
    }

    if (typeof value === "string") {
      const parsedValue = Number.parseInt(value, 10);

      if (Number.isFinite(parsedValue) && parsedValue > 0) {
        return parsedValue;
      }
    }
  }

  return undefined;
}

function normalizeCreatedAt(value: string | null) {
  if (!value) {
    return new Date(0).toISOString();
  }

  const parsedTimestamp = Date.parse(value);

  if (Number.isFinite(parsedTimestamp)) {
    return new Date(parsedTimestamp).toISOString();
  }

  return new Date(0).toISOString();
}

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
