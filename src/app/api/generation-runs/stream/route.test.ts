import { describe, expect, test } from "vitest";
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
      "progress",
      "progress",
      "progress",
      "completed",
    ]);
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
      },
    });
    for (const event of events) {
      if (event.type === "completed") {
        expect(event.run).not.toHaveProperty("replies");
      } else if (event.type === "progress") {
        expect(event).not.toHaveProperty("replies");
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

  test("requests outside-X enrichment when source and replies are thin", async () => {
    const thinContext = buildThinTweetContext();
    const enrichmentRequests: unknown[] = [];
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F9999&usersDirection=Make+the+launch+risk+clear.",
      ),
      {
        retrieveOutsideXEnrichment: async (input) => {
          enrichmentRequests.push(input);

          return {
            retrievedAt: "2026-06-05T10:20:00.000Z",
            items: [
              {
                title: "Outside report",
                summary: "The launch is tied to a broader platform shift.",
                url: "https://example.com/report",
              },
            ],
          };
        },
        retrieveTweetContext: async () => thinContext,
      },
    );
    const events = await readStreamEvents(response);

    expect(enrichmentRequests).toEqual([
      {
        sourceTweet: thinContext.sourceTweet,
        usersDirection: "Make the launch risk clear.",
        replySignals: [],
      },
    ]);
    expect(events.at(-1)).toMatchObject({
      type: "completed",
      run: {
        sourceTweet: thinContext.sourceTweet,
      },
    });
    expect(JSON.stringify(events)).not.toContain("Outside report");
    expect(JSON.stringify(events)).not.toContain("enrichment");
  });

  test("skips outside-X enrichment when source and replies are sufficient", async () => {
    const enrichmentRequests: unknown[] = [];
    const sufficientContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/1357",
    );
    const response = await streamGenerationRun(
      new Request(
        "https://tech-news-roaster.test/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F1357",
      ),
      {
        retrieveOutsideXEnrichment: async (input) => {
          enrichmentRequests.push(input);

          return {
            retrievedAt: "2026-06-05T10:20:00.000Z",
            items: [
              {
                title: "Unneeded outside report",
                summary: "This should not be requested.",
              },
            ],
          };
        },
        retrieveTweetContext: async () => sufficientContext,
      },
    );

    expect(enrichmentRequests).toEqual([]);
    expect(await response.text()).toContain(sufficientContext.sourceTweet.text);
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
