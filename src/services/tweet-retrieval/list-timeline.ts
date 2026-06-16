import { z } from "zod";
import {
  extractTweetRecords,
  normalizeSourceTweet,
  type RetrievedSourceTweet,
  retrievedSourceTweetSchema,
  TweetRetrievalError,
  twitterApiBaseUrl,
} from "./tweet-retrieval";

// List-timeline retrieval adapter (issue 014). Reads the operator's Discovery Source — the
// followed accounts reconstructed as a small number of operator-owned X Lists — over a trailing
// time window, surfacing candidate tweets for downstream virality scoring and clustering. The
// algorithmic For You feed is deliberately never read here; it reaches the product only through
// manual runs.
//
// Per the 007 spike (see ADR-0020), TwitterAPI.io honors the native X search operators server-side,
// so each read builds `list:<id> min_faves:F min_retweets:R since_time:<unix> until_time:<unix>`
// and lets X pre-filter rather than pulling full list timelines and filtering in-house. The
// min_faves/min_retweets pair is a coarse recall floor, not the virality bar — author-relative
// scoring still runs in-house on the survivors (issue 015) — so callers keep F and R conservatively
// low. The provider boundary stays sealed: callers receive the normalized retrieval shape only.

const advancedSearchPath = "/twitter/tweet/advanced_search";
const advancedSearchQueryType = "Latest";
const defaultMaxPagesPerList = 5;
const defaultMaxRetries = 5;
const baseBackoffMs = 1_000;
const maxBackoffMs = 60_000;

const listTimelineWindowSchema = z
  .object({
    since: z.date(),
    until: z.date(),
  })
  .strict();

const listTimelineReadResultSchema = z
  .object({
    listIds: z.array(z.string().min(1)),
    window: listTimelineWindowSchema,
    tweets: z.array(retrievedSourceTweetSchema),
  })
  .strict();

export type ListTimelineWindow = z.infer<typeof listTimelineWindowSchema>;

export type ListTimelineReadInput = {
  /** Operator-owned X List ids covering the Discovery Source (~5 lists for ~5000 follows). */
  listIds: string[];
  /** Trailing time window; consecutive sweeps overlap, so windows may abut or overlap. */
  window: ListTimelineWindow;
  /** Coarse server-side recall floor on likes. Omit or 0 to leave likes unfiltered. */
  minFaves?: number;
  /** Coarse server-side recall floor on reposts. Omit or 0 to leave reposts unfiltered. */
  minReposts?: number;
  /** Page cap per list (cost backstop). One page ≈ 20 tweets. */
  maxPagesPerList?: number;
};

/** A candidate tweet surfaced by discovery, pre-scoring — the normalized retrieval shape. */
export type DiscoveredTweet = RetrievedSourceTweet;

export type ListTimelineReadResult = {
  listIds: string[];
  window: ListTimelineWindow;
  tweets: DiscoveredTweet[];
};

export type ListTimelineFetchOptions = {
  fetcher?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  maxRetries?: number;
};

type ResolvedFetchOptions = Required<ListTimelineFetchOptions>;

type RawRecord = Record<string, unknown>;

export async function readListTimeline(
  input: ListTimelineReadInput,
  options: ListTimelineFetchOptions = {},
): Promise<ListTimelineReadResult> {
  const apiKey = process.env.TWITTERAPI_IO_API_KEY;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new TweetRetrievalError();
    }

    return buildFixtureListTimeline(input);
  }

  return readWithTwitterApiIo(input, apiKey, options);
}

async function readWithTwitterApiIo(
  input: ListTimelineReadInput,
  apiKey: string,
  options: ListTimelineFetchOptions,
): Promise<ListTimelineReadResult> {
  const resolvedOptions: ResolvedFetchOptions = {
    fetcher: fetch,
    sleep: defaultSleep,
    now: Date.now,
    maxRetries: defaultMaxRetries,
    ...options,
  };
  const seenTweetIds = new Set<string>();
  const tweets: DiscoveredTweet[] = [];

  for (const listId of input.listIds) {
    const listTweets = await readSingleList(listId, input, apiKey, resolvedOptions);

    for (const tweet of listTweets) {
      if (seenTweetIds.has(tweet.id)) {
        continue;
      }

      seenTweetIds.add(tweet.id);
      tweets.push(tweet);
    }
  }

  return listTimelineReadResultSchema.parse({
    listIds: input.listIds,
    window: input.window,
    tweets,
  });
}

async function readSingleList(
  listId: string,
  input: ListTimelineReadInput,
  apiKey: string,
  options: ResolvedFetchOptions,
): Promise<DiscoveredTweet[]> {
  const maxPages = input.maxPagesPerList ?? defaultMaxPagesPerList;
  const query = buildListTimelineQuery(listId, input);
  const collected: DiscoveredTweet[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await fetchSearchPage(query, cursor, apiKey, options);

    for (const record of extractTweetRecords(payload)) {
      const tweet = tryNormalizeDiscoveredTweet(record);

      if (tweet) {
        collected.push(tweet);
      }
    }

    cursor = readNextCursor(payload);

    if (!cursor || readHasNextPage(payload) === false) {
      break;
    }
  }

  return collected;
}

export function buildListTimelineQuery(listId: string, input: ListTimelineReadInput): string {
  const parts = [`list:${listId}`];

  if (input.minFaves && input.minFaves > 0) {
    parts.push(`min_faves:${input.minFaves}`);
  }

  if (input.minReposts && input.minReposts > 0) {
    parts.push(`min_retweets:${input.minReposts}`);
  }

  // Unix-second window operators per the 007 spike; the dotted-date forms are unsupported.
  parts.push(`since_time:${toUnixSeconds(input.window.since)}`);
  parts.push(`until_time:${toUnixSeconds(input.window.until)}`);

  return parts.join(" ");
}

async function fetchSearchPage(
  query: string,
  cursor: string | null,
  apiKey: string,
  options: ResolvedFetchOptions,
): Promise<unknown> {
  const url = new URL(`${twitterApiBaseUrl}${advancedSearchPath}`);

  url.searchParams.set("query", query);
  url.searchParams.set("queryType", advancedSearchQueryType);

  if (cursor) {
    url.searchParams.set("cursor", cursor);
  }

  for (let attempt = 0; ; attempt += 1) {
    const response = await options.fetcher(url.toString(), {
      headers: {
        "x-api-key": apiKey,
        Accept: "application/json",
      },
    });

    // Free/zero-balance keys are throttled to ~1 request / 5s; pace and back off on 429,
    // honoring x-rate-limit-reset (a Unix-second timestamp) and falling back to exponential
    // backoff when it is absent.
    if (response.status === 429 && attempt < options.maxRetries) {
      await options.sleep(retryWaitMs(response, attempt, options.now));
      continue;
    }

    if (!response.ok) {
      throw new TweetRetrievalError();
    }

    return response.json() as Promise<unknown>;
  }
}

function retryWaitMs(response: Response, attempt: number, now: () => number): number {
  const reset = response.headers.get("x-rate-limit-reset");

  if (reset) {
    const untilReset = Number(reset) * 1_000 - now();

    if (Number.isFinite(untilReset) && untilReset > 0) {
      return Math.min(untilReset + 500, maxBackoffMs);
    }
  }

  const retryAfter = response.headers.get("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);

    if (Number.isFinite(seconds) && seconds > 0) {
      return Math.min(seconds * 1_000 + 500, maxBackoffMs);
    }
  }

  return Math.min(baseBackoffMs * 2 ** attempt, maxBackoffMs);
}

function tryNormalizeDiscoveredTweet(record: RawRecord): DiscoveredTweet | null {
  try {
    return normalizeSourceTweet(record, buildFallbackTweetUrl(record));
  } catch {
    // A record we cannot normalize into the shape (e.g. empty text) is dropped rather than
    // failing the whole windowed read.
    return null;
  }
}

function buildFallbackTweetUrl(record: RawRecord): string {
  const tweetId = readString(record, ["id", "id_str", "tweetId"]);
  const author = isRecord(record.author)
    ? record.author
    : isRecord(record.user)
      ? record.user
      : null;
  const username = author ? readString(author, ["username", "userName", "screen_name"]) : null;

  if (tweetId && username) {
    return `https://x.com/${username}/status/${tweetId}`;
  }

  if (tweetId) {
    return `https://x.com/i/web/status/${tweetId}`;
  }

  return "https://x.com";
}

function readNextCursor(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  return readString(payload, ["next_cursor", "nextCursor", "cursor"]);
}

function readHasNextPage(payload: unknown): boolean | null {
  if (!isRecord(payload)) {
    return null;
  }

  for (const key of ["has_next_page", "hasNextPage"]) {
    const value = payload[key];

    if (typeof value === "boolean") {
      return value;
    }
  }

  return null;
}

export function buildFixtureListTimeline(input: ListTimelineReadInput): ListTimelineReadResult {
  const windowMidpoint = new Date(
    Math.floor((input.window.since.getTime() + input.window.until.getTime()) / 2),
  ).toISOString();
  const tweets = [
    {
      id: "fixture-discovered-1",
      url: "https://x.com/foundersnap/status/fixture-discovered-1",
      text: "Anthropic shipped a discovery API that quietly turns every follow list into a newswire, and incumbents have no answer.",
      createdAt: windowMidpoint,
      author: {
        username: "foundersnap",
        displayName: "Founder Snap",
      },
      metrics: {
        replies: 18,
        reposts: 42,
        quotes: 9,
        likes: 410,
        views: 31_000,
      },
      mediaReferences: [
        {
          id: "fixture-discovered-1-media-1",
          kind: "image",
          url: "https://cdn.example.com/discovery-newswire.jpg",
          previewUrl: "https://cdn.example.com/discovery-newswire-preview.jpg",
          altText: "Diagram of a list-polling discovery pipeline.",
          width: 1600,
          height: 900,
        },
      ],
    },
    {
      id: "fixture-discovered-2",
      url: "https://x.com/sfbuildlog/status/fixture-discovered-2",
      text: "Small lab, big breakout: their eval numbers just leapfrogged the frontier and nobody saw it coming.",
      createdAt: windowMidpoint,
      author: {
        username: "sfbuildlog",
        displayName: "SF Build Log",
      },
      metrics: {
        replies: 6,
        reposts: 21,
        quotes: 3,
        likes: 190,
        views: 12_500,
      },
      mediaReferences: [],
    },
  ].map((tweet) => retrievedSourceTweetSchema.parse(tweet));

  return {
    listIds: input.listIds,
    window: input.window,
    tweets,
  };
}

function toUnixSeconds(value: Date): number {
  return Math.floor(value.getTime() / 1_000);
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readString(record: unknown, keys: string[]): string | null {
  if (!isRecord(record)) {
    return null;
  }

  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function isRecord(value: unknown): value is RawRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
