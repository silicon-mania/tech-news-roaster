import { describe, expect, test, vi } from "vitest";
import {
  parseGenerationStreamEvent,
  parseJokeContextSnapshot,
} from "@/features/generation/generation-events";
import { JokeContextGatheringError } from "@/features/joke-context-gathering/joke-context-gathering";
import {
  buildFixtureTweetContext,
  type RetrievedTweetContext,
} from "@/features/tweet-retrieval/tweet-retrieval";
import { GET, streamGenerationRun } from "./route";

describe("generation stream route", () => {
  test("returns validated SSE progress and completed events without placeholder images in local development", async () => {
    const previousEndpoint = process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;
    const previousApiKey = process.env.OUTSIDE_X_ENRICHMENT_API_KEY;

    delete process.env.OUTSIDE_X_ENRICHMENT_ENDPOINT;
    delete process.env.OUTSIDE_X_ENRICHMENT_API_KEY;

    const response = await GET(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F1234&usersDirection=Keep+it+spiky.",
      ),
    );

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const events = await readStreamEvents(response);

    expect(events.map((event) => event.type)).toEqual([
      "progress",
      "progress",
      "progress",
      "completed",
    ]);
    expect(JSON.stringify(events)).not.toContain("picsum");
    expect(events[0]).toMatchObject({
      type: "progress",
      label: "Drafts for 1234",
      draftCount: 1,
      sourceTweet: expect.objectContaining({
        text: expect.stringContaining("agent workspace"),
      }),
    });
    expect(events[3]).toMatchObject({
      type: "completed",
      run: {
        label: "Drafts for 1234",
        sourceTweet: expect.objectContaining({
          text: expect.stringContaining("agent workspace"),
        }),
        drafts: expect.arrayContaining([
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "openai",
            visibleRationale: expect.any(String),
          }),
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "anthropic",
            visibleRationale: expect.any(String),
          }),
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "google",
            visibleRationale: expect.any(String),
          }),
        ]),
        generationResultStates: {
          contextGathering: {
            status: "completed",
          },
          newsLinkedImageDiscovery: {
            message: expect.stringContaining("local development"),
            status: "failed",
          },
        },
        jokeContextSnapshot: expect.objectContaining({
          sourceTweetId: "1234",
        }),
      },
    });
    for (const event of events) {
      if (event.type === "completed") {
        expect(event.run).not.toHaveProperty("replies");
      } else if (event.type === "progress") {
        expect(event).not.toHaveProperty("replies");
      } else if (event.type === "enrichment-completed") {
        expect(event).not.toHaveProperty("items");
        expect(event).not.toHaveProperty("retrievedAt");
      }
    }

    restoreEnvValue("OUTSIDE_X_ENRICHMENT_ENDPOINT", previousEndpoint);
    restoreEnvValue("OUTSIDE_X_ENRICHMENT_API_KEY", previousApiKey);
  });

  test("emits a failed event when source tweet retrieval fails", async () => {
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F1234",
      ),
      {
        retrieveTweetContext: async () => {
          throw new Error("Provider exploded.");
        },
      },
    );
    const [event] = await readStreamEvents(response);

    expect(event).toEqual({
      type: "failed",
      message: "Source tweet could not be retrieved.",
    });
  });

  test("passes the accepted Source Tweet URL through the retrieval boundary", async () => {
    const retrieved = buildFixtureTweetContext("https://x.com/siliconmania/status/5678");
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F5678",
      ),
      {
        retrieveTweetContext: async ({ sourceTweetUrl }) => ({
          ...retrieved,
          sourceTweet: {
            ...retrieved.sourceTweet,
            url: sourceTweetUrl,
            text: "Retrieved source tweet text from the service.",
          },
        }),
      },
    );

    expect(await response.text()).toContain("Retrieved source tweet text from the service.");
  });

  test("requests joke context gathering and news-linked image discovery before text generation", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/1357");
    const discoveryRequests: unknown[] = [];
    const gatherRequests: unknown[] = [];
    const orchestrationRequests: unknown[] = [];
    const callOrder: string[] = [];
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F1357&usersDirection=Make+the+launch+risk+clear.",
      ),
      {
        discoverNewsLinkedImages: async (input) => {
          callOrder.push("discover-images");
          discoveryRequests.push(input);

          return buildNewsLinkedImageDiscoveryResult();
        },
        gatherJokeContext: async (input) => {
          callOrder.push("gather-context");
          gatherRequests.push(input);

          return buildJokeContextSnapshot("1357");
        },
        orchestrateGeneration: async (input) => {
          callOrder.push("orchestrate");
          orchestrationRequests.push(input);

          return buildCompletedRun(input.sourceTweet, "1357");
        },
        retrieveTweetContext: async () => tweetContext,
      },
    );
    const events = await readStreamEvents(response);

    expect(callOrder).toEqual(["gather-context", "discover-images", "orchestrate"]);
    expect(gatherRequests).toEqual([{ tweetContext }]);
    expect(discoveryRequests).toEqual([
      {
        sourceTweet: tweetContext.sourceTweet,
        usersDirection: "Make the launch risk clear.",
        replySignals: expect.arrayContaining([
          expect.objectContaining({
            id: "1357-reply-1",
            text: expect.stringContaining("workflow lock-in"),
          }),
        ]),
      },
    ]);
    expect(orchestrationRequests).toEqual([
      {
        replySignals: expect.arrayContaining([
          expect.objectContaining({
            id: "1357-reply-1",
          }),
        ]),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: "https://x.com/siliconmania/status/1357",
        usersDirection: "Make the launch risk clear.",
      },
    ]);
    expect(events[0]).toMatchObject({
      type: "enrichment-completed",
      sourceTweet: tweetContext.sourceTweet,
      newsLinkedImages: buildNewsLinkedImageDiscoveryResult().newsLinkedImages,
    });
    expect(events.at(-1)).toMatchObject({
      type: "completed",
      run: {
        sourceTweet: tweetContext.sourceTweet,
        jokeContextSnapshot: {
          sourceTweetId: "1357",
        },
        generationResultStates: {
          contextGathering: {
            status: "completed",
          },
          newsLinkedImageDiscovery: {
            status: "completed",
          },
        },
      },
    });
  });

  test("keeps a successful joke context snapshot when news-linked image discovery returns zero images", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/9999");
    const orchestrateGeneration = vi.fn(async (input) =>
      buildCompletedRun(input.sourceTweet, "9999"),
    );
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F9999",
      ),
      {
        discoverNewsLinkedImages: async () => ({
          discoveredAt: "2026-06-05T10:20:00.000Z",
          newsLinkedImages: [],
        }),
        gatherJokeContext: async () => buildJokeContextSnapshot("9999"),
        orchestrateGeneration,
        retrieveTweetContext: async () => tweetContext,
      },
    );
    const events = await readStreamEvents(response);

    expect(orchestrateGeneration).toHaveBeenCalledTimes(1);
    expect(events.map((event) => event.type)).toEqual([
      "progress",
      "progress",
      "progress",
      "completed",
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "completed",
      run: {
        jokeContextSnapshot: {
          sourceTweetId: "9999",
        },
        generationResultStates: {
          contextGathering: {
            status: "completed",
          },
          newsLinkedImageDiscovery: {
            message: "News-linked image discovery could not find qualifying images.",
            status: "failed",
          },
        },
      },
    });
  });

  test("fails the run before creative branches begin when joke context gathering fails", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/9999");
    const discoverNewsLinkedImages = vi.fn();
    const orchestrateGeneration = vi.fn();
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F9999",
      ),
      {
        discoverNewsLinkedImages,
        gatherJokeContext: async () => {
          throw new JokeContextGatheringError();
        },
        orchestrateGeneration,
        retrieveTweetContext: async () => tweetContext,
      },
    );
    const [event] = await readStreamEvents(response);

    expect(discoverNewsLinkedImages).not.toHaveBeenCalled();
    expect(orchestrateGeneration).not.toHaveBeenCalled();
    expect(event).toEqual({
      type: "failed",
      message: "Joke context gathering could not form usable context.",
    });
  });

  test("passes news-linked image discovery through for thin sources", async () => {
    const discoveryRequests: unknown[] = [];
    const thinContext = buildThinTweetContext();
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F9999",
      ),
      {
        discoverNewsLinkedImages: async (input) => {
          discoveryRequests.push(input);

          return buildNewsLinkedImageDiscoveryResult();
        },
        retrieveTweetContext: async () => thinContext,
      },
    );

    expect(discoveryRequests).toEqual([
      {
        sourceTweet: thinContext.sourceTweet,
        usersDirection: "",
        replySignals: [],
      },
    ]);
    expect(await response.text()).toContain(thinContext.sourceTweet.text);
  });

  test("streams fallback disclosure and complete draft metadata", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F2468",
      ),
      {
        orchestrateGeneration: async () => ({
          fallbackDisclosure:
            "Provider fallback used for Anthropic; duplicate model provenance is shown on affected drafts.",
          label: "Drafts for 2468",
          sourceTweet: tweetContext.sourceTweet,
          drafts: [
            {
              angle: "platform leverage",
              id: "draft-openai",
              modelProvenance: "test-model",
              provider: "openai",
              text: "Quote-tweet draft: OpenAI draft.",
              visibleRationale: "OpenAI rationale.",
            },
            {
              angle: "operator pressure",
              fallbackForProvider: "anthropic",
              id: "draft-openai-fallback-anthropic",
              modelProvenance: "test-model (fallback for Anthropic)",
              provider: "openai",
              text: "Quote-tweet draft: fallback draft.",
              visibleRationale: "Fallback rationale.",
            },
            {
              angle: "distribution bet",
              id: "draft-google",
              modelProvenance: "test-model",
              provider: "google",
              text: "Quote-tweet draft: Google draft.",
              visibleRationale: "Google rationale.",
            },
          ],
        }),
        retrieveTweetContext: async () => tweetContext,
      },
    );
    const events = await readStreamEvents(response);

    expect(events.map((event) => event.type)).toEqual([
      "progress",
      "progress",
      "progress",
      "completed",
    ]);
    expect(events[1]).toMatchObject({
      type: "progress",
      draft: {
        fallbackForProvider: "anthropic",
        provider: "openai",
        visibleRationale: "Fallback rationale.",
      },
    });
    expect(events[3]).toMatchObject({
      type: "completed",
      run: {
        fallbackDisclosure: expect.stringContaining("Anthropic"),
        drafts: expect.arrayContaining([
          expect.objectContaining({
            modelProvenance: "test-model (fallback for Anthropic)",
          }),
        ]),
      },
    });
  });
});

async function readStreamEvents(response: Response) {
  const rawEvents = await response.text();

  return rawEvents
    .trim()
    .split("\n\n")
    .map((rawEvent) => {
      const dataLine = rawEvent.split("\n").find((line) => line.startsWith("data: "));

      if (!dataLine) {
        throw new Error("Missing SSE data line.");
      }

      return parseGenerationStreamEvent(JSON.parse(dataLine.replace("data: ", "")));
    });
}

function buildThinTweetContext(): RetrievedTweetContext {
  const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/9999");

  return {
    sourceTweet: {
      ...tweetContext.sourceTweet,
      text: "Huge if true.",
    },
    replies: [],
  };
}

function restoreEnvValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function buildCompletedRun(
  sourceTweet: RetrievedTweetContext["sourceTweet"],
  sourceTweetId: string,
) {
  return {
    label: `Drafts for ${sourceTweetId}`,
    sourceTweet,
    drafts: [
      {
        angle: "platform leverage",
        id: "draft-openai",
        modelProvenance: "test-model",
        provider: "openai" as const,
        text: "Quote-tweet draft: OpenAI draft.",
        visibleRationale: "OpenAI rationale.",
      },
      {
        angle: "incentive shift",
        id: "draft-anthropic",
        modelProvenance: "test-model",
        provider: "anthropic" as const,
        text: "Quote-tweet draft: Anthropic draft.",
        visibleRationale: "Anthropic rationale.",
      },
      {
        angle: "distribution bet",
        id: "draft-google",
        modelProvenance: "test-model",
        provider: "google" as const,
        text: "Quote-tweet draft: Google draft.",
        visibleRationale: "Google rationale.",
      },
    ],
  };
}

function buildJokeContextSnapshot(sourceTweetId: string) {
  return parseJokeContextSnapshot({
    capturedAt: "2026-06-06T10:10:00.000Z",
    sourceTweetId,
    structuredContext: {
      authorContext: {
        authoritySignals: ["Operator is close to the launch."],
        displayName: "Silicon Mania",
        handle: "@siliconmania",
        relationshipToTopic: "Announcing its own workflow launch.",
      },
      forbiddenAssumptions: ["Do not invent missing product details."],
      jokeContextQuality: {
        status: "usable",
        summary: "Enough context exists to support grounded jokes.",
      },
      jokeableTensions: ["The launch promises simplicity while increasing platform dependence."],
      replySignals: {
        representativeSnippets: [
          {
            authorHandle: "@replyguy",
            replyId: `${sourceTweetId}-reply-1`,
            signal: "Audience reads this as workflow lock-in.",
            snippet: "Cool, now every workflow starts looking locked in.",
          },
        ],
        summary: "Replies focus on workflow lock-in and operator pressure.",
      },
      sourceTweetClaim: "The source tweet claims the launch removes the final workflow bottleneck.",
      sourceTweetMediaExtraction: {
        mediaKinds: ["image"],
        notableDetails: ["Launch card shows one-click workflow automation."],
        summary: "The media shows a workflow automation launch card.",
        visibleText: ["One-click workflow automation"],
      },
      supportingFacts: ["The rollout is framed as an operator productivity update."],
      unknowns: ["No pricing detail is confirmed in the source tweet."],
    },
  });
}

function buildNewsLinkedImageDiscoveryResult() {
  return {
    discoveredAt: "2026-06-05T10:20:00.000Z",
    newsLinkedImages: [
      {
        id: "news-linked-image-1",
        url: "https://example.com/news-linked-image.jpg",
        altText: "News-linked image candidate.",
        sourceUrl: "https://example.com/report",
        title: "News-linked product image",
      },
    ],
  };
}
