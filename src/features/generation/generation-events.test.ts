import { describe, expect, test } from "vitest";
import { buildReplySignals } from "@/features/enrichment/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/features/tweet-retrieval/tweet-retrieval";
import {
  buildGenerationFailureEvent,
  buildStubbedGenerationEvents,
  parseCompletedGenerationRunPayload,
  parseGenerationStreamEvent,
} from "./generation-events";

describe("generation event contracts", () => {
  test("builds deterministic progress events followed by a completed run", () => {
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/2468",
    );
    const events = buildStubbedGenerationEvents({
      replySignals: buildReplySignals(tweetContext),
      sourceTweet: tweetContext.sourceTweet,
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
      sourceTweet: expect.objectContaining({
        text: expect.stringContaining("agent workspace"),
      }),
    });
    expect(events[3]).toMatchObject({
      type: "completed",
      run: {
        label: "Drafts for 2468",
        sourceTweet: expect.objectContaining({
          text: expect.stringContaining("agent workspace"),
        }),
        drafts: expect.arrayContaining([
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "openai",
            visibleRationale: expect.stringContaining("platform leverage"),
          }),
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "anthropic",
          }),
          expect.objectContaining({
            modelProvenance: "local draft model",
            provider: "google",
          }),
        ]),
      },
    });
  });

  test("rejects completed runs without exactly three drafts", () => {
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/2468",
    );

    expect(() =>
      parseCompletedGenerationRunPayload({
        label: "Incomplete run",
        sourceTweet: tweetContext.sourceTweet,
        drafts: [
          {
            angle: "incomplete",
            id: "one",
            text: "Quote-tweet draft: One draft is not a completed comparison.",
            modelProvenance: "local draft model",
            provider: "openai",
            visibleRationale: "This should still fail because it is alone.",
          },
        ],
      }),
    ).toThrow();
  });

  test("builds a short failed retrieval event", () => {
    expect(
      parseGenerationStreamEvent(
        buildGenerationFailureEvent("Source tweet could not be retrieved."),
      ),
    ).toEqual({
      type: "failed",
      message: "Source tweet could not be retrieved.",
    });
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
