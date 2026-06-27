import { describe, expect, test } from "vitest";
import { buildStubbedGenerationRun } from "@/services/generation";
import { buildReplySignals } from "@/services/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";

describe("generation fixtures", () => {
  test("builds a deterministic completed run with three-provider drafts", () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const run = buildStubbedGenerationRun({
      replySignals: buildReplySignals(tweetContext),
      sourceTweet: tweetContext.sourceTweet,
      sourceTweetUrl: "https://x.com/siliconmania/status/2468",
      usersDirection: "Keep it skeptical.",
    });

    expect(run).toMatchObject({
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
    });
    expect(run.drafts).toHaveLength(3);
  });
});
