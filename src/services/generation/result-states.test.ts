import { describe, expect, test } from "vitest";
import {
  buildStubbedGenerationRun,
  parseCompletedGenerationRunPayload,
  parseGenerationResultStates,
  parseJokeContextSnapshot,
  parseStructuredJokeContext,
} from "@/services/generation";
import { buildReplySignals } from "@/services/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import {
  buildGenerationResultStates,
  buildJokeContextSnapshot,
  buildStructuredJokeContext,
} from "./test-fixtures";

describe("generation result-state contracts", () => {
  test("validates context and independent result-state contracts", () => {
    const jokeContextSnapshot = parseJokeContextSnapshot(buildJokeContextSnapshot());
    const generationResultStates = parseGenerationResultStates(
      buildGenerationResultStates({
        jokeContextSnapshot,
      }),
    );

    expect(parseStructuredJokeContext(buildStructuredJokeContext())).toMatchObject({
      sourceTweetClaim: "The source tweet claims the launch removes the final workflow bottleneck.",
    });
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
      }).contextGathering,
    ).toMatchObject({
      debugLog: ["Started context gathering.", "No usable claim remained."],
      status: "failed",
    });
    expect(generationResultStates).toMatchObject({
      contextGathering: {
        status: "completed",
      },
      textGeneration: {
        status: "completed",
      },
    });

    expect(
      parseCompletedGenerationRunPayload({
        label: "Drafts for 2468",
        sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468").sourceTweet,
        drafts: buildStubbedGenerationRun({
          replySignals: buildReplySignals(
            buildFixtureTweetContext("https://x.com/siliconmania/status/2468"),
          ),
          sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468")
            .sourceTweet,
          sourceTweetUrl: "https://x.com/siliconmania/status/2468",
          usersDirection: "Keep it skeptical.",
        }).drafts,
        jokeContextSnapshot,
        generationResultStates,
      }),
    ).toMatchObject({
      generationResultStates: {
        textGeneration: {
          status: "completed",
        },
      },
    });
  });
});
