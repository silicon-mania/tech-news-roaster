import { describe, expect, test } from "vitest";
import {
  buildStubbedGenerationEvents,
  parseCompletedGenerationRunPayload,
  parseSelectedVisualJoke,
  parseVisualJoke,
  parseVisualJokeMetadata,
  parseVisualJokeSet,
} from "@/services/generation";
import { buildReplySignals } from "@/services/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import {
  buildVisualJoke,
  buildVisualJokeMetadata,
  buildVisualJokeSet,
  buildVisualJokes,
} from "./test-fixtures";

describe("visual joke contracts", () => {
  test("rejects invalid visual joke set sizes and missing recommended ordering", () => {
    // An empty set is unpublishable, and more than the cap is still rejected...
    expect(() =>
      parseVisualJokeSet({
        ...buildVisualJokeSet(),
        jokes: [],
      }),
    ).toThrow();

    expect(() =>
      parseVisualJokeSet({
        ...buildVisualJokeSet(),
        jokes: buildVisualJokes(9),
      }),
    ).toThrow();

    // ...but a single surviving joke is a valid publishable set: we would rather
    // ship the few that clear the critic than fail the whole area.
    expect(() =>
      parseVisualJokeSet({
        ...buildVisualJokeSet(),
        jokes: buildVisualJokes(1),
      }),
    ).not.toThrow();

    expect(() =>
      parseVisualJokeSet({
        ...buildVisualJokeSet(),
        jokes: [buildVisualJoke(0, { recommended: false }), ...buildVisualJokes(7).slice(1)],
      }),
    ).toThrow();
  });

  test("rejects malformed visual joke metadata and out-of-set selections", () => {
    const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());

    expect(() =>
      parseVisualJokeMetadata({
        ...buildVisualJokeMetadata(),
        shortRationale: " ",
      }),
    ).toThrow();

    expect(() =>
      parseVisualJoke({
        ...buildVisualJoke(0),
        metadata: {
          ...buildVisualJokeMetadata(),
          referencedFact: " ",
        },
      }),
    ).toThrow();

    expect(() =>
      parseSelectedVisualJoke(
        {
          selectedAt: "2026-06-06T10:14:00.000Z",
          visualJokeId: "visual-joke-missing",
        },
        visualJokeSet,
      ),
    ).toThrow();

    expect(() =>
      parseCompletedGenerationRunPayload({
        label: "Drafts for 2468",
        sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468").sourceTweet,
        drafts: buildStubbedGenerationEvents({
          replySignals: buildReplySignals(
            buildFixtureTweetContext("https://x.com/siliconmania/status/2468"),
          ),
          sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468")
            .sourceTweet,
          sourceTweetUrl: "https://x.com/siliconmania/status/2468",
          usersDirection: "Keep it skeptical.",
        }).flatMap((event) => (event.type === "progress" ? [event.draft] : [])),
        selectedVisualJoke: {
          selectedAt: "2026-06-06T10:14:00.000Z",
          visualJokeId: "visual-joke-missing",
        },
        visualJokeSet,
      }),
    ).toThrow();
  });
});
