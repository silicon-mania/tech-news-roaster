import { describe, expect, test } from "vitest";
import { parseGenerationStreamEvent } from "@/features/generation/generation-events";
import { buildFixtureTweetContext } from "@/features/tweet-retrieval/tweet-retrieval";
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
          expect.objectContaining({ modelProvenance: "OpenAI stub model" }),
          expect.objectContaining({ modelProvenance: "Anthropic stub model" }),
          expect.objectContaining({ modelProvenance: "Google stub model" }),
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
});
