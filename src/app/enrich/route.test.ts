import { afterEach, describe, expect, test, vi } from "vitest";
import { POST } from "./route";

const previousEnv = { ...process.env };
const previousFetch = globalThis.fetch;

afterEach(() => {
  process.env = { ...previousEnv };
  globalThis.fetch = previousFetch;
  vi.restoreAllMocks();
});

describe("outside-X enrichment route", () => {
  test("requires the configured bearer token", async () => {
    process.env.OUTSIDE_X_ENRICHMENT_API_KEY = "enrichment-secret";

    const response = await POST(
      new Request("https://tech-news-roaster.test/enrich", {
        body: JSON.stringify(buildRequestPayload()),
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );

    expect(response.status).toBe(401);
  });

  test("returns hidden findings and news-linked images from Serper when summarization is unavailable", async () => {
    const fetchRequests: Array<{ body: unknown; url: string }> = [];

    process.env.OUTSIDE_X_ENRICHMENT_API_KEY = "enrichment-secret";
    process.env.SERPER_API_KEY = "serper-secret";
    delete process.env.AI_GATEWAY_API_KEY;
    globalThis.fetch = vi.fn(async (input, init) => {
      fetchRequests.push({
        body: JSON.parse(String(init?.body)),
        url: String(input),
      });

      if (String(input).endsWith("/search")) {
        return Response.json({
          organic: [
            {
              title: "Launch report",
              link: "https://example.com/report",
              snippet: "The launch changes the product workflow.",
              imageUrl: "https://example.com/report-card.jpg",
            },
          ],
        });
      }

      if (String(input).endsWith("/images")) {
        return Response.json({
          images: [
            {
              title: "Launch visual",
              imageUrl: "https://cdn.example.com/launch.jpg",
              link: "https://example.com/report",
              source: "Example",
            },
            {
              title: "Invalid visual",
              imageUrl: "data:image/png;base64,abc",
              link: "https://example.com/report",
            },
          ],
        });
      }

      throw new Error(`Unexpected fetch to ${String(input)}.`);
    });

    const response = await POST(
      new Request("https://tech-news-roaster.test/enrich", {
        body: JSON.stringify(buildRequestPayload()),
        headers: {
          Authorization: "Bearer enrichment-secret",
          "Content-Type": "application/json",
        },
        method: "POST",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(fetchRequests.map((request) => request.url)).toEqual([
      "https://google.serper.dev/search",
      "https://google.serper.dev/images",
    ]);
    expect(JSON.stringify(fetchRequests.map((request) => request.body))).not.toContain(
      "Make it spiky",
    );
    expect(payload).toMatchObject({
      items: [
        {
          title: "Launch report",
          summary: "The launch changes the product workflow.",
          url: "https://example.com/report",
        },
      ],
    });
    expect(payload.newsLinkedImages[0]).toMatchObject({
      altText: "Launch visual",
      sourceUrl: "https://example.com/report",
      title: "Launch visual",
      url: "https://cdn.example.com/launch.jpg",
    });
    expect(payload.retrievedAt).toEqual(expect.any(String));
    expect(payload.newsLinkedImages).toHaveLength(2);
    expect(payload.newsLinkedImages[0]).not.toHaveProperty("id");
  });
});

function buildRequestPayload() {
  return {
    sourceTweet: {
      id: "123",
      url: "https://x.com/user/status/123",
      text: "OpenAI shipped a new agent workspace.",
      createdAt: "2026-06-05T10:00:00.000Z",
      author: {
        username: "user",
        displayName: "User",
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
          id: "source-tweet-media-1",
          kind: "image",
          url: "https://cdn.example.com/source-tweet-image.jpg",
          previewUrl: "https://cdn.example.com/source-tweet-image-preview.jpg",
          altText: "Source tweet image.",
          width: 1280,
          height: 720,
        },
      ],
    },
    replySignals: [
      {
        id: "reply-1",
        text: "The workflow lock-in is the real story.",
        engagementScore: 42,
      },
    ],
    usersDirection: "Make it spiky.",
  };
}
