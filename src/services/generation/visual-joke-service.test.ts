import { describe, expect, test, vi } from "vitest";
import { parseJokeContextSnapshot } from "@/services/generation";
import { defaultVisualJokeDirection, generateVisualJokeSet } from "./visual-joke-service";

describe("visual joke service", () => {
  test("returns a ranked, pattern-diverse visual joke set with a bold candidate when context supports it", async () => {
    const result = await generateVisualJokeSet(
      {
        jokeContextSnapshot: buildJokeContextSnapshot(),
        visualJokeDirection: defaultVisualJokeDirection,
      },
      {
        now: () => new Date("2026-06-06T10:12:00.000Z"),
      },
    );

    expect(result.visualJokeDirection).toBe(defaultVisualJokeDirection);
    expect(result.visualJokeSet).toMatchObject({
      generatedAt: "2026-06-06T10:12:00.000Z",
      id: "visual-joke-set-1",
      targetCount: 8,
    });
    expect(result.visualJokeSet.jokes).toHaveLength(8);
    expect(result.visualJokeSet.jokes[0]).toMatchObject({
      rank: 1,
      recommended: true,
    });
    expect(new Set(result.visualJokeSet.jokes.map((joke) => joke.metadata.jokePattern)).size).toBe(
      8,
    );
    expect(
      result.visualJokeSet.jokes.some(
        (joke) => joke.metadata.jokePattern === "earned edge" && joke.text.includes("OpenAI"),
      ),
    ).toBe(true);
  });

  test("rejects boring accuracy, unsupported claims, condescension, cheap profanity, and overlong titles", async () => {
    const result = await generateVisualJokeSet(
      {
        jokeContextSnapshot: buildJokeContextSnapshot(),
        visualJokeDirection: defaultVisualJokeDirection,
      },
      {
        now: () => new Date("2026-06-06T10:12:00.000Z"),
        provider: {
          model: "test-model",
          provider: "test",
          async generateCandidates() {
            return [
              buildCandidate("OpenAI launches agent workspace", "truthful misdirection"),
              buildCandidate("Workflow Lock-In With Better Lighting", "dark tech satire"),
              buildCandidate("Roadmap As A Service", "tech-native metaphor"),
              buildCandidate("OpenAI Premium Coordination Cloud", "fake product naming"),
              buildCandidate("The Moat Is The Workflow", "deadpan diagnosis"),
              buildCandidate("Every Launch Is A Billing Event", "incentive roast"),
              buildCandidate("Breaking: The Dashboard Needs A Manager", "absurd headline"),
              buildCandidate("OpenAI Wants Rent On Your Entire Workflow", "earned edge"),
              buildCandidate("OpenAI Turns The Roadmap Into Rent", "truthful misdirection"),
              {
                metadata: {
                  jokePattern: "truthful misdirection",
                  jokeTarget: "platform leverage",
                  referencedFact: "This fact is not in the snapshot.",
                  shortRationale: "Unsupported claim should be rejected.",
                },
                text: "Invented Context Everywhere",
              },
              {
                metadata: {
                  jokePattern: "dark tech satire",
                  jokeTarget: "harmless users",
                  referencedFact: "The rollout is framed as an operator productivity update.",
                  shortRationale: "Condescension should be rejected.",
                },
                text: "Only Idiots Need This Dashboard",
              },
              {
                metadata: {
                  jokePattern: "earned edge",
                  jokeTarget: "platform leverage",
                  referencedFact:
                    "The launch promises simplicity while increasing platform dependence.",
                  shortRationale: "Cheap profanity should be rejected.",
                },
                text: "OpenAI's Shitshow Workflow Empire",
              },
              {
                metadata: {
                  jokePattern: "absurd headline",
                  jokeTarget: "platform leverage",
                  referencedFact: "The rollout is framed as an operator productivity update.",
                  shortRationale: "Overlong titles should be rejected.",
                },
                text: "A very long joke title that keeps explaining the product instead of landing any kind of fast punchline",
              },
            ];
          },
        },
      },
    );

    expect(result.visualJokeSet.jokes).toHaveLength(8);
    expect(result.visualJokeSet.jokes.map((joke) => joke.text)).not.toContain(
      "OpenAI launches agent workspace",
    );
    expect(result.visualJokeSet.jokes.map((joke) => joke.text)).not.toContain(
      "Invented Context Everywhere",
    );
    expect(result.visualJokeSet.jokes.map((joke) => joke.text)).not.toContain(
      "Only Idiots Need This Dashboard",
    );
    expect(result.visualJokeSet.jokes.map((joke) => joke.text)).not.toContain(
      "OpenAI's Shitshow Workflow Empire",
    );
  });

  test("sends only the joke context snapshot and visual joke direction to the AI Gateway prompt", async () => {
    const previousApiKey = process.env.AI_GATEWAY_API_KEY;
    const previousModel = process.env.AI_GATEWAY_VISUAL_JOKE_MODEL;
    const previousFetch = globalThis.fetch;
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                candidates: [
                  buildCandidatePayload(
                    "OpenAI Ships The Pricing Shortcut",
                    "truthful misdirection",
                  ),
                  buildCandidatePayload(
                    "Workflow Lock-In With Better Lighting",
                    "dark tech satire",
                  ),
                  buildCandidatePayload("Roadmap As A Service", "tech-native metaphor"),
                  buildCandidatePayload("OpenAI Premium Coordination Cloud", "fake product naming"),
                  buildCandidatePayload("The Moat Is The Workflow", "deadpan diagnosis"),
                  buildCandidatePayload("Every Launch Is A Billing Event", "incentive roast"),
                  buildCandidatePayload(
                    "Breaking: The Dashboard Needs A Manager",
                    "absurd headline",
                  ),
                  buildCandidatePayload("OpenAI Wants Rent On Your Entire Workflow", "earned edge"),
                ],
              }),
            },
          },
        ],
      }),
    );

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_VISUAL_JOKE_MODEL = "openai/visual-joke-model";
    globalThis.fetch = fetcher;

    try {
      await generateVisualJokeSet({
        jokeContextSnapshot: buildJokeContextSnapshot(),
        visualJokeDirection: defaultVisualJokeDirection,
      });

      const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
        messages?: Array<{ content?: string; role?: string }>;
        model?: string;
      };
      const userPrompt = JSON.parse(
        String(body.messages?.find((message) => message.role === "user")?.content),
      ) as Record<string, unknown>;

      expect(body.model).toBe("openai/visual-joke-model");
      expect(userPrompt).toMatchObject({
        jokeContextSnapshot: expect.objectContaining({
          sourceTweetId: "2468",
        }),
        visualJokeDirection: defaultVisualJokeDirection,
      });
      expect(userPrompt).not.toHaveProperty("usersDirection");
      expect(userPrompt).not.toHaveProperty("userImagePrompt");
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousApiKey);
      restoreEnvValue("AI_GATEWAY_VISUAL_JOKE_MODEL", previousModel);
      globalThis.fetch = previousFetch;
    }
  });

  test("does not retry or fall back when the configured provider fails", async () => {
    const provider = {
      model: "test-model",
      provider: "test" as const,
      generateCandidates: vi.fn(async () => {
        throw new Error("Provider exploded.");
      }),
    };

    await expect(
      generateVisualJokeSet(
        {
          jokeContextSnapshot: buildJokeContextSnapshot(),
          visualJokeDirection: defaultVisualJokeDirection,
        },
        {
          provider,
        },
      ),
    ).rejects.toThrow("Provider exploded.");
    expect(provider.generateCandidates).toHaveBeenCalledTimes(1);
  });
});

function buildJokeContextSnapshot() {
  return parseJokeContextSnapshot({
    capturedAt: "2026-06-06T10:10:00.000Z",
    sourceTweetId: "2468",
    structuredContext: {
      authorContext: {
        authoritySignals: ["Primary launch screenshots are attached to the source tweet."],
        displayName: "Silicon Mania",
        handle: "@siliconmania",
        relationshipToTopic: "Operator watching platform incentives in public.",
        role: "Tech publication",
      },
      forbiddenAssumptions: ["Do not invent missing product details."],
      jokeContextQuality: {
        status: "strong",
        summary: "The tweet, media, and replies provide enough context for grounded satire.",
      },
      jokeableTensions: ["The launch promises simplicity while increasing platform dependence."],
      replySignals: {
        representativeSnippets: [
          {
            authorHandle: "@replyguy",
            replyId: "2468-reply-1",
            signal: "platform lock-in",
            snippet: "Cool, now every workflow starts looking locked in.",
          },
        ],
        summary: "Replies focus on workflow lock-in and operator pressure.",
      },
      sourceTweetClaim:
        "OpenAI says the agent workspace removes the final workflow bottleneck for product teams.",
      sourceTweetMediaExtraction: {
        mediaKinds: ["image"],
        notableDetails: ["Launch card shows one-click workflow automation."],
        summary: "The media shows a workflow automation launch card.",
        visibleText: ["One-click workflow automation"],
      },
      supportingFacts: ["The rollout is framed as an operator productivity update."],
      unknowns: ["No pricing detail is confirmed in the source tweet."],
    },
  });
}

function buildCandidate(text: string, jokePattern: string) {
  return {
    metadata: buildCandidateMetadata(jokePattern),
    text,
  };
}

function buildCandidatePayload(text: string, jokePattern: string) {
  return {
    ...buildCandidateMetadata(jokePattern),
    text,
  };
}

function buildCandidateMetadata(jokePattern: string) {
  return {
    jokePattern,
    jokeTarget: "platform leverage",
    referencedFact: "The rollout is framed as an operator productivity update.",
    shortRationale: "Turns the feature reveal into a pricing-pressure punchline.",
  };
}

function restoreEnvValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
