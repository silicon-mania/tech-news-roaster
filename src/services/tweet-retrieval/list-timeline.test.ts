import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildFixtureListTimeline,
  buildListTimelineQuery,
  type DiscoveredTweet,
  type ListTimelineReadInput,
  type ListTimelineWindow,
  readListTimeline,
  TweetRetrievalError,
} from "./index";

const window: ListTimelineWindow = {
  since: new Date("2026-06-16T00:00:00.000Z"),
  until: new Date("2026-06-16T06:00:00.000Z"),
};
const sinceTime = Math.floor(window.since.getTime() / 1_000);
const untilTime = Math.floor(window.until.getTime() / 1_000);

function discoveredTweetRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "3001",
    url: "https://x.com/foundersnap/status/3001",
    text: "Anthropic shipped a discovery API and incumbents have no answer.",
    retweetCount: 42,
    replyCount: 18,
    likeCount: 410,
    quoteCount: 9,
    viewCount: 31_000,
    createdAt: "Tue Jun 16 03:00:00 +0000 2026",
    author: {
      userName: "foundersnap",
      name: "Founder Snap",
    },
    extendedEntities: {
      media: [
        {
          media_key: "media-1",
          type: "photo",
          media_url_https: "https://cdn.example.com/discovery-newswire.jpg",
        },
      ],
    },
    ...overrides,
  };
}

function searchQueryFrom(requestedUrl: string): string {
  return new URL(requestedUrl).searchParams.get("query") ?? "";
}

describe("buildListTimelineQuery", () => {
  test("builds a server-side pre-filter query with the Unix-second window operators", () => {
    const query = buildListTimelineQuery("1900000000000000001", {
      listIds: ["1900000000000000001"],
      window,
      minFaves: 100,
      minReposts: 50,
    });

    expect(query).toBe(
      `list:1900000000000000001 min_faves:100 min_retweets:50 since_time:${sinceTime} until_time:${untilTime}`,
    );
  });

  test("omits the min_faves/min_retweets floor when not requested", () => {
    const query = buildListTimelineQuery("42", { listIds: ["42"], window });

    expect(query).toBe(`list:42 since_time:${sinceTime} until_time:${untilTime}`);
    expect(query).not.toContain("min_faves");
    expect(query).not.toContain("min_retweets");
  });
});

describe("readListTimeline", () => {
  beforeEach(() => {
    vi.stubEnv("TWITTERAPI_IO_API_KEY", "twitterapi-secret");
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test("reads a List timeline over the trailing window and normalizes tweets without touching For You", async () => {
    const requestedUrls: string[] = [];
    const requestHeaders: Headers[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrls.push(String(input));
      requestHeaders.push(new Headers(init?.headers));

      return Response.json({
        tweets: [discoveredTweetRecord()],
        has_next_page: false,
        next_cursor: "",
        status: "success",
      });
    });

    const result = await readListTimeline(
      {
        listIds: ["1900000000000000001"],
        window,
        minFaves: 100,
        minReposts: 50,
      },
      { fetcher },
    );

    expect(requestedUrls).toHaveLength(1);

    const requestUrl = new URL(requestedUrls[0]);
    expect(requestUrl.pathname).toBe("/twitter/tweet/advanced_search");
    expect(requestUrl.searchParams.get("queryType")).toBe("Latest");
    expect(searchQueryFrom(requestedUrls[0])).toBe(
      `list:1900000000000000001 min_faves:100 min_retweets:50 since_time:${sinceTime} until_time:${untilTime}`,
    );
    // The For You feed is never read by the adapter.
    for (const requested of requestedUrls) {
      expect(requested).not.toContain("for_you");
      expect(requested).not.toContain("home");
      expect(requested).toContain("/twitter/tweet/advanced_search");
    }
    expect(requestHeaders[0].get("x-api-key")).toBe("twitterapi-secret");

    expect(result.listIds).toEqual(["1900000000000000001"]);
    expect(result.window).toEqual(window);
    expect(result.tweets).toHaveLength(1);

    const [firstTweet]: DiscoveredTweet[] = result.tweets;
    expect(firstTweet).toMatchObject({
      id: "3001",
      url: "https://x.com/foundersnap/status/3001",
      createdAt: "2026-06-16T03:00:00.000Z",
      author: { username: "foundersnap", displayName: "Founder Snap" },
      metrics: { replies: 18, reposts: 42, quotes: 9, likes: 410, views: 31_000 },
    });
    expect(firstTweet.mediaReferences).toEqual([
      {
        id: "media-1",
        kind: "image",
        url: "https://cdn.example.com/discovery-newswire.jpg",
      },
    ]);
  });

  test("paginates a list via the cursor up to the page cap and dedupes across lists", async () => {
    const requestedUrls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const requested = String(input);
      requestedUrls.push(requested);
      const cursor = new URL(requested).searchParams.get("cursor");

      if (!cursor) {
        return Response.json({
          tweets: [discoveredTweetRecord({ id: "100" })],
          has_next_page: true,
          next_cursor: "cursor-2",
        });
      }

      return Response.json({
        // "200" is unique; "100" repeats and must be deduped away.
        tweets: [discoveredTweetRecord({ id: "200" }), discoveredTweetRecord({ id: "100" })],
        has_next_page: false,
        next_cursor: "",
      });
    });

    const result = await readListTimeline({ listIds: ["7"], window }, { fetcher });

    expect(requestedUrls).toHaveLength(2);
    expect(new URL(requestedUrls[0]).searchParams.get("cursor")).toBeNull();
    expect(new URL(requestedUrls[1]).searchParams.get("cursor")).toBe("cursor-2");
    expect(result.tweets.map((tweet) => tweet.id)).toEqual(["100", "200"]);
  });

  test("aggregates and dedupes tweets across multiple operator-owned lists", async () => {
    const queriedLists: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const query = searchQueryFrom(String(input));
      const listId = query.match(/list:(\S+)/)?.[1] ?? "";
      queriedLists.push(listId);

      // Both lists surface tweet "500"; list "b" also surfaces a unique "600".
      const tweets =
        listId === "a"
          ? [discoveredTweetRecord({ id: "500" })]
          : [discoveredTweetRecord({ id: "500" }), discoveredTweetRecord({ id: "600" })];

      return Response.json({ tweets, has_next_page: false, next_cursor: "" });
    });

    const result = await readListTimeline({ listIds: ["a", "b"], window }, { fetcher });

    expect(queriedLists).toEqual(["a", "b"]);
    expect(result.tweets.map((tweet) => tweet.id)).toEqual(["500", "600"]);
  });

  test("backs off on HTTP 429 honoring x-rate-limit-reset, then returns the page", async () => {
    const resetUnixSeconds = 1_900_000_030;
    const sleepDurations: number[] = [];
    const sleep = vi.fn(async (ms: number) => {
      sleepDurations.push(ms);
    });
    const now = () => 1_900_000_000_000;
    let call = 0;
    const fetcher = vi.fn(async () => {
      call += 1;

      if (call === 1) {
        return new Response(null, {
          status: 429,
          headers: { "x-rate-limit-reset": String(resetUnixSeconds) },
        });
      }

      return Response.json({ tweets: [discoveredTweetRecord()], has_next_page: false });
    });

    const result = await readListTimeline({ listIds: ["7"], window }, { fetcher, sleep, now });

    expect(fetcher).toHaveBeenCalledTimes(2);
    // reset (1_900_000_030s) - now (1_900_000_000s) = 30s, plus the 500ms cushion.
    expect(sleepDurations).toEqual([30_500]);
    expect(result.tweets).toHaveLength(1);
  });

  test("raises a retrieval error on a non-rate-limit provider failure", async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 503 }));

    await expect(readListTimeline({ listIds: ["7"], window }, { fetcher })).rejects.toThrow(
      TweetRetrievalError,
    );
  });
});

describe("buildFixtureListTimeline", () => {
  const input: ListTimelineReadInput = { listIds: ["fixture-list"], window };

  test("returns normalized discovered tweets within the requested window when no key is set", async () => {
    vi.stubEnv("TWITTERAPI_IO_API_KEY", "");
    vi.stubEnv("NODE_ENV", "development");

    const fetcher = vi.fn();
    const result = await readListTimeline(input, { fetcher });

    expect(fetcher).not.toHaveBeenCalled();
    expect(result.tweets.length).toBeGreaterThan(0);
    for (const tweet of result.tweets) {
      expect(Date.parse(tweet.createdAt)).toBeGreaterThanOrEqual(window.since.getTime());
      expect(Date.parse(tweet.createdAt)).toBeLessThanOrEqual(window.until.getTime());
    }

    vi.unstubAllEnvs();
  });

  test("carries the normalized retrieval shape with media references", () => {
    const result = buildFixtureListTimeline(input);

    expect(result.listIds).toEqual(["fixture-list"]);
    expect(result.tweets[0]).toMatchObject({
      author: { username: "foundersnap" },
      metrics: { reposts: 42, likes: 410 },
    });
    expect(result.tweets[0].mediaReferences[0]).toMatchObject({ kind: "image" });
    expect(result.tweets[1].mediaReferences).toEqual([]);
  });
});
