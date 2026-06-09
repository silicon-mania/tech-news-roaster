import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  buildFixtureTweetContext,
  retrieveTweetContext,
  TweetRetrievalError,
} from "./tweet-retrieval";

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

  test("normalizes TwitterAPI.io tweet, media references, and replies into the internal contract", async () => {
    const requestedUrls: string[] = [];
    const requestHeaders: Headers[] = [];
    const fetcher = vi.fn(async (input: RequestInfo | URL, init) => {
      const url = String(input);

      requestedUrls.push(url);
      requestHeaders.push(new Headers(init?.headers));

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
            extendedEntities: {
              media: [
                {
                  media_key: "media-image-1",
                  type: "photo",
                  media_url_https: "https://cdn.example.com/still-image.jpg",
                  preview_url: "https://cdn.example.com/still-image-preview.jpg",
                  ext_alt_text: "Still product image.",
                  original_info: {
                    width: 1280,
                    height: 720,
                  },
                },
                {
                  media_key: "media-video-1",
                  type: "video",
                  media_url_https: "https://cdn.example.com/video-poster.jpg",
                  preview_url: "https://cdn.example.com/video-poster.jpg",
                  ext_alt_text: "Launch teaser video.",
                  original_info: {
                    width: 1920,
                    height: 1080,
                  },
                  video_info: {
                    duration_millis: 31_000,
                    variants: [
                      {
                        bitrate: 832_000,
                        content_type: "video/mp4",
                        url: "https://cdn.example.com/launch-teaser-832.mp4",
                      },
                      {
                        bitrate: 2_176_000,
                        content_type: "video/mp4",
                        url: "https://cdn.example.com/launch-teaser-2176.mp4",
                      },
                    ],
                  },
                },
              ],
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
    expect(requestHeaders).toHaveLength(2);
    for (const headers of requestHeaders) {
      expect(headers.get("x-api-key")).toBe("twitterapi-secret");
      expect([...headers.entries()].filter(([key]) => key === "x-api-key")).toHaveLength(1);
    }
    expect(context.sourceTweet).toMatchObject({
      id: "2062195681947971840",
      text: "Real source tweet text from TwitterAPI.io.",
      createdAt: "2026-06-07T12:00:00.000Z",
      author: {
        username: "v0",
        displayName: "v0",
      },
    });
    expect(context.sourceTweet.mediaReferences).toEqual([
      {
        id: "media-image-1",
        kind: "image",
        url: "https://cdn.example.com/still-image.jpg",
        previewUrl: "https://cdn.example.com/still-image-preview.jpg",
        altText: "Still product image.",
        width: 1280,
        height: 720,
      },
      {
        id: "media-video-1",
        kind: "video",
        url: "https://cdn.example.com/launch-teaser-2176.mp4",
        previewUrl: "https://cdn.example.com/video-poster.jpg",
        altText: "Launch teaser video.",
        width: 1920,
        height: 1080,
        durationMs: 31_000,
      },
    ]);
    expect(context.sourceTweet.mediaReferences[0]).not.toHaveProperty("summary");
    expect(context.replies[0]).toMatchObject({
      id: "2062195681947971841",
      createdAt: "2026-06-07T12:05:00.000Z",
      author: {
        username: "reply_user",
        displayName: "Reply User",
      },
    });
  });

  test("degrades replies failures to an empty list while keeping the retrieved source tweet", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url.includes("/twitter/tweet/replies/v2")) {
        return new Response(null, { status: 503 });
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
            media: [
              {
                id: "media-image-1",
                type: "photo",
                media_url_https: "https://cdn.example.com/still-image.jpg",
              },
            ],
          },
        ],
        status: "success",
        message: "",
      });
    });

    const context = await retrieveTweetContext({
      sourceTweetUrl: "https://x.com/v0/status/2062195681947971840",
    });

    expect(context.sourceTweet.mediaReferences).toEqual([
      {
        id: "media-image-1",
        kind: "image",
        url: "https://cdn.example.com/still-image.jpg",
      },
    ]);
    expect(context.replies).toEqual([]);
  });

  test("fails when the source tweet is unavailable", async () => {
    globalThis.fetch = vi.fn(async () =>
      Response.json({
        tweets: [],
        status: "success",
        message: "",
      }),
    );

    await expect(
      retrieveTweetContext({
        sourceTweetUrl: "https://x.com/v0/status/2062195681947971840",
      }),
    ).rejects.toThrow(TweetRetrievalError);
  });

  test("fixture tweet retrieval includes provider-agnostic media references", () => {
    const context = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    expect(context.sourceTweet.mediaReferences).toHaveLength(3);
    expect(
      context.sourceTweet.mediaReferences.map((mediaReference) => mediaReference.kind),
    ).toEqual(["image", "image", "video"]);
    expect(context.sourceTweet.mediaReferences[1]).toMatchObject({
      altText: "Screenshot of the new agent workspace UI.",
      height: 900,
      id: "fixture-media-2",
      kind: "image",
      previewUrl: "https://cdn.example.com/agent-workspace-screenshot-preview.jpg",
      url: "https://cdn.example.com/agent-workspace-screenshot.jpg",
      width: 1440,
    });
    expect(context.sourceTweet.mediaReferences[2]).toMatchObject({
      durationMs: 24_000,
      kind: "video",
    });
    expect(context.sourceTweet.mediaReferences[0]).not.toHaveProperty("notableDetails");
  });
});
