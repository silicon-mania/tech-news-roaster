import { describe, expect, test, vi } from "vitest";
import { buildFixtureTweetContext, type RetrievedTweetContext } from "@/services/tweet-retrieval";
import { gatherJokeContext, type JokeContextGatheringError } from "./joke-context-gathering";

describe("joke context gathering", () => {
  test("builds a complete joke context snapshot without unnecessary supporting research", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const researchSupportingContext = vi.fn(async () => ({
      forbiddenAssumptions: ["Should not be used."],
      jokeableTensions: ["Should not be used."],
      supportingFacts: ["Should not be used."],
      unknowns: ["Should not be used."],
    }));

    const snapshot = await gatherJokeContext(
      { tweetContext },
      {
        captureNow: () => "2026-06-06T10:10:00.000Z",
        researchSupportingContext,
      },
    );

    expect(researchSupportingContext).not.toHaveBeenCalled();
    expect(snapshot).toMatchObject({
      capturedAt: "2026-06-06T10:10:00.000Z",
      sourceTweetId: "2468",
      structuredContext: {
        authorContext: {
          displayName: "Silicon Mania",
          handle: "siliconmania",
        },
        jokeContextQuality: {
          status: "strong",
        },
        replySignals: {
          representativeSnippets: expect.arrayContaining([
            expect.objectContaining({
              authorHandle: "reply_one",
              replyId: "2468-reply-1",
              signal: "platform lock-in",
            }),
          ]),
        },
        sourceTweetClaim: expect.stringContaining("OpenAI just shipped an agent workspace"),
        sourceTweetMediaExtraction: {
          summary: expect.stringContaining("product UI screenshot"),
        },
      },
    });
    expect(snapshot.structuredContext.supportingFacts[0]).toContain("Source tweet anchor:");
  });

  test("keeps context usable when some source-tweet media reads fail", async () => {
    const fixtureTweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/9753");
    const tweetContext = buildTweetContext({
      replies: fixtureTweetContext.replies,
      sourceTweet: {
        ...fixtureTweetContext.sourceTweet,
        mediaReferences: [
          buildMediaReference({
            altText: "Launch product screenshot.",
            id: "screenshot-1",
            kind: "image",
            url: "https://cdn.example.com/launch-product-screenshot.jpg",
          }),
          buildMediaReference({
            altText: "Broken chart render.",
            id: "broken-chart-1",
            kind: "image",
            url: "https://cdn.example.com/broken-chart-render.jpg",
          }),
        ],
      },
    });

    const snapshot = await gatherJokeContext({
      tweetContext,
    });

    expect(snapshot.structuredContext.jokeContextQuality.status).toBe("usable");
    expect(snapshot.structuredContext.sourceTweetMediaExtraction.summary).toContain(
      "product UI screenshot",
    );
    expect(snapshot.structuredContext.unknowns).toContain(
      "Some source-tweet media details remained unavailable.",
    );
  });

  test("fails before creative work begins when thin tweet text and failed media cannot recover the news", async () => {
    const tweetContext = buildTweetContext({
      replies: [],
      sourceTweet: {
        ...buildFixtureTweetContext("https://x.com/siliconmania/status/8888").sourceTweet,
        id: "8888",
        mediaReferences: [
          buildMediaReference({
            altText: "Broken launch video.",
            durationMs: 31_000,
            id: "broken-video-1",
            kind: "video",
            url: "https://cdn.example.com/broken-launch-video.mp4",
          }),
        ],
        text: "Huge.",
        url: "https://x.com/siliconmania/status/8888",
      },
    });

    await expect(
      gatherJokeContext({
        tweetContext,
      }),
    ).rejects.toMatchObject({
      name: "JokeContextGatheringError",
      userMessage: "Joke context gathering could not form usable context.",
    } satisfies Partial<JokeContextGatheringError>);
  });

  test("merges forbidden assumptions from degraded local context and supporting research", async () => {
    const tweetContext = buildTweetContext({
      replies: [],
      sourceTweet: {
        ...buildFixtureTweetContext("https://x.com/siliconmania/status/1111").sourceTweet,
        id: "1111",
        mediaReferences: [
          buildMediaReference({
            altText: "Broken launch image.",
            id: "broken-image-1",
            kind: "image",
            url: "https://cdn.example.com/broken-launch-image.jpg",
          }),
        ],
        text: "Agent launch for teams.",
        url: "https://x.com/siliconmania/status/1111",
      },
    });
    const researchSupportingContext = vi.fn(async () => ({
      forbiddenAssumptions: ["Do not claim the launch replaces entire teams."],
      jokeableTensions: ["Premium workflow becomes a coordination tax."],
      supportingFacts: [
        "The launch is framed as workflow automation rather than a general AI announcement.",
        "Pricing and access posture are part of the public read on the rollout.",
      ],
      unknowns: [],
    }));

    const snapshot = await gatherJokeContext(
      {
        tweetContext,
      },
      { researchSupportingContext },
    );

    expect(researchSupportingContext).toHaveBeenCalledTimes(1);
    expect(snapshot.structuredContext.forbiddenAssumptions).toEqual(
      expect.arrayContaining([
        "Do not claim timelines, adoption numbers, or business outcomes that the Source Tweet does not show.",
        "Do not pretend the unread media confirmed details that were never extracted.",
        "Do not invent an audience consensus that is not present in the replies.",
        "Do not claim the launch replaces entire teams.",
      ]),
    );
  });

  test("captures representative reply snippets in engagement order with signal labels", async () => {
    const tweetContext = buildTweetContext({
      replies: [
        buildReply({
          id: "reply-high",
          likes: 19,
          quotes: 4,
          reposts: 2,
          text: "The pricing page is the real punchline here.",
          username: "pricing_watch",
        }),
        buildReply({
          id: "reply-mid",
          likes: 13,
          quotes: 1,
          reposts: 1,
          text: "Feels like workflow lock-in with better gradients.",
          username: "workflow_realist",
        }),
        buildReply({
          id: "reply-low",
          likes: 4,
          quotes: 0,
          reposts: 0,
          text: "Is this actually new?",
          username: "skeptical_reader",
        }),
      ],
      sourceTweet: {
        ...buildFixtureTweetContext("https://x.com/siliconmania/status/2222").sourceTweet,
        id: "2222",
        mediaReferences: [],
        text: "OpenAI says the new workspace turns scattered AI tasks into one operator surface.",
        url: "https://x.com/siliconmania/status/2222",
      },
    });

    const snapshot = await gatherJokeContext({
      tweetContext,
    });

    expect(snapshot.structuredContext.replySignals.summary).toBe(
      "Replies cluster around pricing pressure, platform lock-in, and skepticism.",
    );
    expect(snapshot.structuredContext.replySignals.representativeSnippets).toEqual([
      expect.objectContaining({
        authorHandle: "pricing_watch",
        replyId: "reply-high",
        signal: "pricing pressure",
        snippet: "The pricing page is the real punchline here.",
      }),
      expect.objectContaining({
        authorHandle: "workflow_realist",
        replyId: "reply-mid",
        signal: "platform lock-in",
        snippet: "Feels like workflow lock-in with better gradients.",
      }),
      expect.objectContaining({
        authorHandle: "skeptical_reader",
        replyId: "reply-low",
        signal: "skepticism",
        snippet: "Is this actually new?",
      }),
    ]);
  });
});

function buildTweetContext(overrides: Partial<RetrievedTweetContext>): RetrievedTweetContext {
  const base = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

  return {
    ...base,
    ...overrides,
  };
}

function buildMediaReference(
  overrides: RetrievedTweetContext["sourceTweet"]["mediaReferences"][number],
) {
  return {
    altText: overrides.altText,
    durationMs: overrides.durationMs,
    height: overrides.height ?? 900,
    id: overrides.id,
    kind: overrides.kind,
    previewUrl: overrides.previewUrl,
    url: overrides.url,
    width: overrides.width ?? 1440,
  };
}

function buildReply({
  id,
  likes,
  quotes,
  reposts,
  text,
  username,
}: {
  id: string;
  likes: number;
  quotes: number;
  reposts: number;
  text: string;
  username: string;
}) {
  return {
    author: {
      displayName: username,
      username,
    },
    createdAt: "2026-06-05T10:04:00.000Z",
    id,
    metrics: {
      likes,
      quotes,
      replies: 0,
      reposts,
      views: 700,
    },
    text,
  };
}
