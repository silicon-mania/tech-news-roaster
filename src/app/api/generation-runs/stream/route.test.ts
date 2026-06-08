import { describe, expect, test, vi } from "vitest";
import { parseGenerationStreamEvent } from "@/features/generation/generation-events";
import {
  buildFixtureTweetContext,
  type RetrievedTweetContext,
} from "@/features/tweet-retrieval/tweet-retrieval";
import { GET, streamGenerationRun } from "./route";

describe("generation stream route", () => {
  test("returns validated SSE progress and completed events", async () => {
    const response = await GET(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F1234&usersDirection=Keep+it+spiky.",
      ),
    );

    expect(response.headers.get("Content-Type")).toContain("text/event-stream");

    const rawEvents = await response.text();
    const events = rawEvents
      .trim()
      .split("\n\n")
      .map((rawEvent) => {
        const dataLine = rawEvent
          .split("\n")
          .find((line) => line.startsWith("data: "));

        if (!dataLine) {
          throw new Error("Missing SSE data line.");
        }

        return parseGenerationStreamEvent(
          JSON.parse(dataLine.replace("data: ", "")),
        );
      });

    expect(events.map((event) => event.type)).toEqual([
      "enrichment-completed",
      "progress",
      "progress",
      "progress",
      "completed",
    ]);
    expect(events[0]).toMatchObject({
      type: "enrichment-completed",
      sourceTweet: expect.objectContaining({
        text: expect.stringContaining("agent workspace"),
      }),
      newsLinkedImages: expect.arrayContaining([
        expect.objectContaining({
          id: "news-linked-image-1",
          url: "https://picsum.photos/seed/1234-1/320/240",
        }),
        expect.objectContaining({
          id: "news-linked-image-2",
          url: "https://picsum.photos/seed/1234-2/320/240",
        }),
        expect.objectContaining({
          id: "news-linked-image-3",
          url: "https://picsum.photos/seed/1234-3/320/240",
        }),
      ]),
    });
    expect(events[1]).toMatchObject({
      type: "progress",
      label: "Drafts for 1234",
      draftCount: 1,
      sourceTweet: expect.objectContaining({
        text: expect.stringContaining("agent workspace"),
      }),
    });
    expect(events[4]).toMatchObject({
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

    const rawEvents = await response.text();
    const dataLine = rawEvents
      .trim()
      .split("\n")
      .find((line) => line.startsWith("data: "));

    expect(
      parseGenerationStreamEvent(
        JSON.parse(dataLine?.replace("data: ", "") ?? "{}"),
      ),
    ).toEqual({
      type: "failed",
      message: "Source tweet could not be retrieved.",
    });
  });

  test("passes the accepted Source Tweet URL through the retrieval boundary", async () => {
    const retrieved = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/5678",
    );
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

    expect(await response.text()).toContain(
      "Retrieved source tweet text from the service.",
    );
  });

  test("requests outside-X enrichment before text generation for every run", async () => {
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/1357",
    );
    const enrichmentRequests: unknown[] = [];
    const orchestrationRequests: unknown[] = [];
    const callOrder: string[] = [];
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F1357&usersDirection=Make+the+launch+risk+clear.",
      ),
      {
        orchestrateGeneration: async (input) => {
          callOrder.push("orchestrate");
          orchestrationRequests.push(input);

          return {
            label: "Drafts for 1357",
            sourceTweet: input.sourceTweet,
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
                angle: "incentive shift",
                id: "draft-anthropic",
                modelProvenance: "test-model",
                provider: "anthropic",
                text: "Quote-tweet draft: Anthropic draft.",
                visibleRationale: "Anthropic rationale.",
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
          };
        },
        retrieveOutsideXEnrichment: async (input) => {
          callOrder.push("enrich");
          enrichmentRequests.push(input);

          return buildEnrichmentContext();
        },
        retrieveTweetContext: async () => tweetContext,
      },
    );
    const events = await readStreamEvents(response);

    expect(callOrder).toEqual(["enrich", "orchestrate"]);
    expect(enrichmentRequests).toEqual([
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
      expect.objectContaining({
        sourceTweet: tweetContext.sourceTweet,
        enrichmentContext: buildEnrichmentContext(),
      }),
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "completed",
      run: {
        sourceTweet: tweetContext.sourceTweet,
      },
    });
    expect(events[0]).toMatchObject({
      type: "enrichment-completed",
      sourceTweet: tweetContext.sourceTweet,
      newsLinkedImages: buildEnrichmentContext().newsLinkedImages,
    });
    expect(JSON.stringify(events)).not.toContain("Outside report");
    expect(JSON.stringify(events)).not.toContain("broader platform shift");
  });

  test("emits a failed event when outside-X enrichment returns zero images", async () => {
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/9999",
    );
    const orchestrateGeneration = vi.fn();
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F9999",
      ),
      {
        orchestrateGeneration,
        retrieveOutsideXEnrichment: async () => ({
          retrievedAt: "2026-06-05T10:20:00.000Z",
          items: [
            {
              title: "Outside report",
              summary: "The launch is tied to a broader platform shift.",
              url: "https://example.com/report",
            },
          ],
          newsLinkedImages: [],
        }),
        retrieveTweetContext: async () => tweetContext,
      },
    );
    const events = await readStreamEvents(response);

    expect(orchestrateGeneration).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        type: "failed",
        message: "Outside-X enrichment could not provide news-linked images.",
      },
    ]);
  });

  test("emits a failed event when outside-X enrichment fails", async () => {
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/9999",
    );
    const orchestrateGeneration = vi.fn();
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F9999",
      ),
      {
        orchestrateGeneration,
        retrieveOutsideXEnrichment: async () => {
          throw new Error("Search provider unavailable.");
        },
        retrieveTweetContext: async () => tweetContext,
      },
    );
    const events = await readStreamEvents(response);

    expect(orchestrateGeneration).not.toHaveBeenCalled();
    expect(events).toEqual([
      {
        type: "failed",
        message: "Outside-X enrichment could not provide news-linked images.",
      },
    ]);
  });

  test("passes mandatory outside-X enrichment through for thin sources", async () => {
    const enrichmentRequests: unknown[] = [];
    const thinContext = buildThinTweetContext();
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F9999",
      ),
      {
        retrieveOutsideXEnrichment: async (input) => {
          enrichmentRequests.push(input);

          return buildEnrichmentContext();
        },
        retrieveTweetContext: async () => thinContext,
      },
    );

    expect(enrichmentRequests).toEqual([
      {
        sourceTweet: thinContext.sourceTweet,
        usersDirection: "",
        replySignals: [],
      },
    ]);
    expect(await response.text()).toContain(thinContext.sourceTweet.text);
  });

  test("streams fallback disclosure and complete draft metadata", async () => {
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/2468",
    );
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
      "enrichment-completed",
      "progress",
      "progress",
      "progress",
      "completed",
    ]);
    expect(events[2]).toMatchObject({
      type: "progress",
      draft: {
        fallbackForProvider: "anthropic",
        provider: "openai",
        visibleRationale: "Fallback rationale.",
      },
    });
    expect(events[4]).toMatchObject({
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
      const dataLine = rawEvent
        .split("\n")
        .find((line) => line.startsWith("data: "));

      if (!dataLine) {
        throw new Error("Missing SSE data line.");
      }

      return parseGenerationStreamEvent(
        JSON.parse(dataLine.replace("data: ", "")),
      );
    });
}

function buildThinTweetContext(): RetrievedTweetContext {
  const tweetContext = buildFixtureTweetContext(
    "https://x.com/siliconmania/status/9999",
  );

  return {
    sourceTweet: {
      ...tweetContext.sourceTweet,
      text: "Huge if true.",
    },
    replies: [],
  };
}

function buildEnrichmentContext() {
  return {
    retrievedAt: "2026-06-05T10:20:00.000Z",
    items: [
      {
        title: "Outside report",
        summary: "The launch is tied to a broader platform shift.",
        url: "https://example.com/report",
      },
    ],
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
