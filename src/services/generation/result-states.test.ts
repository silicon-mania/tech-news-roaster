import { describe, expect, test } from "vitest";
import {
  buildGenerationRunStateEvent,
  buildStubbedGenerationEvents,
  parseCompletedGenerationRunPayload,
  parseGenerationResultStates,
  parseGenerationStreamEvent,
  parseJokeContextSnapshot,
  parseSelectedVisualJoke,
  parseStructuredJokeContext,
  parseVisualJoke,
  parseVisualJokeDirectionText,
  parseVisualJokeMetadata,
  parseVisualJokeSet,
} from "@/services/generation";
import { buildReplySignals } from "@/services/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import {
  buildGenerationResultStates,
  buildJokeContextSnapshot,
  buildStructuredJokeContext,
  buildVisualJokeMetadata,
  buildVisualJokeSet,
} from "./test-fixtures";

describe("generation result-state contracts", () => {
  test("validates v3 context, visual joke, and independent result-state contracts", () => {
    const jokeContextSnapshot = parseJokeContextSnapshot(buildJokeContextSnapshot());
    const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());
    const generationResultStates = parseGenerationResultStates(
      buildGenerationResultStates({
        jokeContextSnapshot,
        visualJokeSet,
      }),
    );

    expect(parseStructuredJokeContext(buildStructuredJokeContext())).toMatchObject({
      sourceTweetClaim: "The source tweet claims the launch removes the final workflow bottleneck.",
    });
    expect(parseVisualJokeDirectionText("  Dark, sharp tech satire only.  ")).toBe(
      "Dark, sharp tech satire only.",
    );
    expect(parseVisualJokeMetadata(buildVisualJokeMetadata())).toMatchObject({
      jokePattern: "truthful misdirection",
    });
    expect(parseVisualJoke(visualJokeSet.jokes[0])).toMatchObject({
      recommended: true,
      rank: 1,
    });
    expect(parseSelectedVisualJoke(null, visualJokeSet)).toBeNull();
    expect(generationResultStates.newsLinkedImageDiscovery.status).toBe("failed");
    expect(generationResultStates.textGeneration.status).toBe("completed");
    expect(
      parseGenerationResultStates({
        contextGathering: {
          debugLog: ["Started context gathering.", "No usable claim remained."],
          failedAt: "2026-06-06T10:10:00.000Z",
          message: "Joke context gathering could not form usable context.",
          startedAt: "2026-06-06T10:08:00.000Z",
          status: "failed",
        },
        imageGeneration: {
          status: "not-started",
        },
        newsLinkedImageDiscovery: {
          status: "not-started",
        },
        textGeneration: {
          status: "not-started",
        },
        visualJokeGeneration: {
          status: "not-started",
        },
      }).contextGathering,
    ).toMatchObject({
      debugLog: ["Started context gathering.", "No usable claim remained."],
      status: "failed",
    });
    expect(
      parseGenerationStreamEvent(
        buildGenerationRunStateEvent({
          generationResultStates,
          label: "Drafts for 2468",
          sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468")
            .sourceTweet,
        }),
      ),
    ).toMatchObject({
      type: "run-state",
      generationResultStates: {
        contextGathering: {
          status: "completed",
        },
        visualJokeGeneration: {
          status: "completed",
        },
      },
    });

    expect(
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
        jokeContextSnapshot,
        generationResultStates,
        selectedVisualJoke: {
          selectedAt: "2026-06-06T10:14:00.000Z",
          visualJokeId: visualJokeSet.jokes[2].id,
        },
        visualJokeDirection: "Dark, sharp tech satire only.",
        visualJokeSet,
      }),
    ).toMatchObject({
      selectedVisualJoke: {
        visualJokeId: visualJokeSet.jokes[2].id,
      },
      visualJokeSet: {
        jokes: expect.arrayContaining([expect.objectContaining({ recommended: true, rank: 1 })]),
      },
    });
  });
});
