import { describe, expect, test } from "vitest";
import { parseGenerationStreamEvent } from "@/features/generation/generation-events";
import { GET } from "./route";

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
    });
    expect(events[3]).toMatchObject({
      type: "completed",
      run: {
        label: "Drafts for 1234",
        drafts: expect.arrayContaining([
          expect.objectContaining({ modelProvenance: "OpenAI stub model" }),
          expect.objectContaining({ modelProvenance: "Anthropic stub model" }),
          expect.objectContaining({ modelProvenance: "Google stub model" }),
        ]),
      },
    });
  });
});
