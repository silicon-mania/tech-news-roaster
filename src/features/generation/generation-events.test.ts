import { describe, expect, test } from "vitest";
import {
  buildStubbedGenerationEvents,
  parseCompletedGenerationRunPayload,
  parseGenerationStreamEvent,
} from "./generation-events";

describe("generation event contracts", () => {
  test("builds deterministic progress events followed by a completed run", () => {
    const events = buildStubbedGenerationEvents({
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "Keep it skeptical.",
    });

    expect(events.map((event) => event.type)).toEqual([
      "progress",
      "progress",
      "progress",
      "completed",
    ]);
    expect(events[0]).toMatchObject({
      type: "progress",
      label: "Drafts for 2468",
      draftCount: 1,
      draftTarget: 3,
    });
    expect(events[3]).toMatchObject({
      type: "completed",
      run: {
        label: "Drafts for 2468",
        drafts: expect.arrayContaining([
          expect.objectContaining({ modelProvenance: "OpenAI stub model" }),
          expect.objectContaining({ modelProvenance: "Anthropic stub model" }),
          expect.objectContaining({ modelProvenance: "Google stub model" }),
        ]),
      },
    });
  });

  test("rejects completed runs without exactly three drafts", () => {
    expect(() =>
      parseCompletedGenerationRunPayload({
        label: "Incomplete run",
        drafts: [
          {
            id: "one",
            text: "Quote-tweet draft: One draft is not a completed comparison.",
            modelProvenance: "OpenAI stub model",
          },
        ],
      }),
    ).toThrow();
  });

  test("rejects unknown stream event shapes", () => {
    expect(() =>
      parseGenerationStreamEvent({
        type: "progress",
        label: "Drafts for 123",
        draftCount: 1,
        draftTarget: 3,
      }),
    ).toThrow();
  });
});
