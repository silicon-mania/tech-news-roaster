import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { retrieveTweetContext } from "./tweet-retrieval";

describe("tweet retrieval", () => {
  const previousFetch = globalThis.fetch;

  beforeEach(() => {
    vi.stubEnv("TWITTERAPI_IO_API_KEY", "twitterapi-secret");
    vi.stubEnv("NODE_ENV", "production");
  });

  afterEach(() => {
    globalThis.fetch = previousFetch;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  test("normalizes TwitterAPI.io tweet and replies payloads into the internal contract", async () => {
    const requestedUrls: string[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      requestedUrls.push(url);

      if (url.includes("/twitter/tweet/replies/v2")) {
        return Response.json({
          replies: [
            {
              id: "2062195681947971841",
              text: "This is the reply signal.",
              retweetCount: 1,
              replyCount: 2,
              likeCount: 3,
              quoteCount: 4,
              viewCount: 500,
              createdAt: "Sun Jun 07 12:05:00 +0000 2026",
              author: {
                userName: "reply_user",
                name: "Reply User",
              },
            },
          ],
          has_next_page: false,
          next_cursor: "",
          status: "success",
          message: "",
        });
      }

      return Response.json({
        tweets: [
          {
            id: "2062195681947971840",
            url: "https://x.com/v0/status/2062195681947971840",
            text: "Real source tweet text from TwitterAPI.io.",
            retweetCount: 10,
            replyCount: 11,
            likeCount: 12,
            quoteCount: 13,
            viewCount: 14_000,
            createdAt: "Sun Jun 07 12:00:00 +0000 2026",
            author: {
              userName: "v0",
              name: "v0",
            },
          },
        ],
        status: "success",
        message: "",
      });
    });

    globalThis.fetch = fetcher;

    const context = await retrieveTweetContext({
      sourceTweetUrl: "https://x.com/v0/status/2062195681947971840",
    });

    expect(requestedUrls[0]).toBe(
      "https://api.twitterapi.io/twitter/tweets?tweet_ids=2062195681947971840",
    );
    expect(requestedUrls[1]).toContain(
      "https://api.twitterapi.io/twitter/tweet/replies/v2?tweetId=2062195681947971840",
    );
    expect(context.sourceTweet).toMatchObject({
      id: "2062195681947971840",
      text: "Real source tweet text from TwitterAPI.io.",
      createdAt: "2026-06-07T12:00:00.000Z",
      author: {
        username: "v0",
        displayName: "v0",
      },
    });
    expect(context.replies[0]).toMatchObject({
      id: "2062195681947971841",
      createdAt: "2026-06-07T12:05:00.000Z",
      author: {
        username: "reply_user",
        displayName: "Reply User",
      },
    });
  });
});
