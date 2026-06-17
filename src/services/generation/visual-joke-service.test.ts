import { describe, expect, test, vi } from "vitest";
import { defaultVisualJokeDirection, parseJokeContextSnapshot } from "@/services/generation";
import { generateVisualJokeSet, VisualJokeGenerationError } from "./visual-joke-service";

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

  test("fails fast when the gateway call exceeds the configured timeout", async () => {
    const previousApiKey = process.env.AI_GATEWAY_API_KEY;
    const previousVercelKey = process.env.VERCEL_AI_GATEWAY_API_KEY;
    const previousTimeout = process.env.AI_GATEWAY_VISUAL_JOKE_TIMEOUT_MS;
    const previousFetch = globalThis.fetch;
    // Never resolves on its own; only the hard timeout can end the call.
    const fetcher = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject((init.signal as AbortSignal).reason),
          );
        }),
    );

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_VISUAL_JOKE_TIMEOUT_MS = "50";
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    globalThis.fetch = fetcher;

    try {
      // The thrown timeout is what the orchestrator already degrades on, so a
      // timed-out Visual Joke generation degrades the run like any failure today.
      await expect(
        generateVisualJokeSet({
          jokeContextSnapshot: buildJokeContextSnapshot(),
          visualJokeDirection: defaultVisualJokeDirection,
        }),
      ).rejects.toThrow(/timed out after \d+s waiting for the AI Gateway/);
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousApiKey);
      restoreEnvValue("VERCEL_AI_GATEWAY_API_KEY", previousVercelKey);
      restoreEnvValue("AI_GATEWAY_VISUAL_JOKE_TIMEOUT_MS", previousTimeout);
      globalThis.fetch = previousFetch;
    }
  });

  test("attaches a critic rejection breakdown to the failure debug log when too few candidates survive", async () => {
    const error = await generateVisualJokeSet(
      {
        jokeContextSnapshot: buildJokeContextSnapshot(),
        visualJokeDirection: defaultVisualJokeDirection,
      },
      {
        provider: {
          model: "critic-test-model",
          provider: "test",
          async generateCandidates() {
            // Every candidate references a fact absent from the snapshot, so the
            // critic rejects all of them for "unsupported-reference".
            return Array.from({ length: 6 }, (_value, index) => ({
              metadata: {
                jokePattern: "truthful misdirection",
                jokeTarget: "platform leverage",
                referencedFact: "This fact is not present anywhere in the snapshot.",
                shortRationale: "Unsupported claim should be rejected.",
              },
              text: `Invented Context Number ${index + 1}`,
            }));
          },
        },
      },
    ).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(VisualJokeGenerationError);
    const debugLog = (error as VisualJokeGenerationError).debugLog ?? [];
    expect(debugLog).toEqual(
      expect.arrayContaining([
        "Step: select-publishable-set",
        "Provider: test/critic-test-model",
        "Rough candidates returned: 6",
        "Passed critic: 0",
        expect.stringContaining("minimum 1"),
        expect.stringContaining("unsupported-reference: 6"),
      ]),
    );
  });

  test("ships the surviving jokes instead of failing when the critic rejects most candidates", async () => {
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
              // Four publishable candidates across distinct patterns...
              buildCandidate("Workflow Lock-In With Better Lighting", "dark tech satire"),
              buildCandidate("Roadmap As A Service", "tech-native metaphor"),
              buildCandidate("The Moat Is The Workflow", "deadpan diagnosis"),
              buildCandidate("Every Launch Is A Billing Event", "incentive roast"),
              // ...and four the critic rejects for an unsupported reference.
              ...Array.from({ length: 4 }, (_value, index) => ({
                metadata: {
                  jokePattern: "truthful misdirection",
                  jokeTarget: "platform leverage",
                  referencedFact: "This fact is not present anywhere in the snapshot.",
                  shortRationale: "Unsupported claim should be rejected.",
                },
                text: `Invented Context Number ${index + 1}`,
              })),
            ];
          },
        },
      },
    );

    expect(result.visualJokeSet.jokes).toHaveLength(4);
    expect(result.visualJokeSet.targetCount).toBe(8);
    expect(result.visualJokeSet.jokes[0]?.recommended).toBe(true);
  });

  test("requests structured outputs and recovers from a single malformed payload with one repair-retry", async () => {
    const previousApiKey = process.env.AI_GATEWAY_API_KEY;
    const previousModel = process.env.AI_GATEWAY_VISUAL_JOKE_MODEL;
    const previousFetch = globalThis.fetch;
    const fetcher = vi.fn<typeof fetch>();
    // First sample breaks JSON.parse; the repair-retry returns a clean batch.
    fetcher.mockResolvedValueOnce(buildMalformedGatewayResponse());
    fetcher.mockResolvedValueOnce(buildValidGatewayResponse());

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_VISUAL_JOKE_MODEL = "openai/visual-joke-model";
    globalThis.fetch = fetcher;

    try {
      const result = await generateVisualJokeSet({
        jokeContextSnapshot: buildJokeContextSnapshot(),
        visualJokeDirection: defaultVisualJokeDirection,
      });

      expect(result.visualJokeSet.jokes).toHaveLength(8);
      expect(fetcher).toHaveBeenCalledTimes(2);

      const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
        response_format?: { json_schema?: { name?: string; strict?: boolean }; type?: string };
      };
      expect(body.response_format?.type).toBe("json_schema");
      expect(body.response_format?.json_schema?.name).toBe("visual_joke_candidates");
      expect(body.response_format?.json_schema?.strict).toBe(true);
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousApiKey);
      restoreEnvValue("AI_GATEWAY_VISUAL_JOKE_MODEL", previousModel);
      globalThis.fetch = previousFetch;
    }
  });

  test("drops response_format and retries without it when the gateway rejects the parameter", async () => {
    const previousApiKey = process.env.AI_GATEWAY_API_KEY;
    const previousModel = process.env.AI_GATEWAY_VISUAL_JOKE_MODEL;
    const previousFetch = globalThis.fetch;
    const fetcher = vi.fn<typeof fetch>();
    // The model rejects response_format outright (the gpt-5.5 400), then succeeds
    // once the parameter is dropped — the run degrades instead of failing.
    fetcher.mockResolvedValueOnce(
      Response.json(
        {
          error: {
            code: "invalid_request_error",
            message: "Invalid input",
            param: "response_format",
            type: "invalid_request_error",
          },
        },
        { status: 400 },
      ),
    );
    fetcher.mockResolvedValueOnce(buildValidGatewayResponse());

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_VISUAL_JOKE_MODEL = "openai/gpt-5.5";
    globalThis.fetch = fetcher;

    try {
      const result = await generateVisualJokeSet({
        jokeContextSnapshot: buildJokeContextSnapshot(),
        visualJokeDirection: defaultVisualJokeDirection,
      });

      expect(result.visualJokeSet.jokes).toHaveLength(8);
      expect(fetcher).toHaveBeenCalledTimes(2);

      const firstBody = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body)) as {
        response_format?: unknown;
      };
      const secondBody = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body)) as {
        response_format?: unknown;
      };
      expect(firstBody.response_format).toBeDefined();
      expect(secondBody.response_format).toBeUndefined();
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousApiKey);
      restoreEnvValue("AI_GATEWAY_VISUAL_JOKE_MODEL", previousModel);
      globalThis.fetch = previousFetch;
    }
  });

  test("fails with a repair-retry debug log after JSON parsing fails on both attempts", async () => {
    const previousApiKey = process.env.AI_GATEWAY_API_KEY;
    const previousModel = process.env.AI_GATEWAY_VISUAL_JOKE_MODEL;
    const previousFetch = globalThis.fetch;
    const fetcher = vi.fn<typeof fetch>(async () => buildMalformedGatewayResponse());

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_VISUAL_JOKE_MODEL = "openai/visual-joke-model";
    globalThis.fetch = fetcher;

    try {
      const error = await generateVisualJokeSet({
        jokeContextSnapshot: buildJokeContextSnapshot(),
        visualJokeDirection: defaultVisualJokeDirection,
      }).catch((thrown: unknown) => thrown);

      expect(error).toBeInstanceOf(VisualJokeGenerationError);
      expect(fetcher).toHaveBeenCalledTimes(2);
      // The underlying SyntaxError stays reachable via the cause chain.
      expect((error as VisualJokeGenerationError).cause).toBeInstanceOf(SyntaxError);
      expect((error as VisualJokeGenerationError).debugLog ?? []).toEqual(
        expect.arrayContaining([
          "Provider: ai-gateway/openai/visual-joke-model",
          expect.stringContaining("JSON parsing failed after 2 attempts"),
        ]),
      );
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

function buildValidGatewayResponse() {
  return Response.json({
    choices: [
      {
        message: {
          content: JSON.stringify({
            candidates: [
              buildCandidatePayload("OpenAI Ships The Pricing Shortcut", "truthful misdirection"),
              buildCandidatePayload("Workflow Lock-In With Better Lighting", "dark tech satire"),
              buildCandidatePayload("Roadmap As A Service", "tech-native metaphor"),
              buildCandidatePayload("OpenAI Premium Coordination Cloud", "fake product naming"),
              buildCandidatePayload("The Moat Is The Workflow", "deadpan diagnosis"),
              buildCandidatePayload("Every Launch Is A Billing Event", "incentive roast"),
              buildCandidatePayload("Breaking: The Dashboard Needs A Manager", "absurd headline"),
              buildCandidatePayload("OpenAI Wants Rent On Your Entire Workflow", "earned edge"),
            ],
          }),
        },
      },
    ],
  });
}

// Reproduces the production failure mode: an unescaped interior quote in a string
// value. The parser reads `"the "`, then hits `cool`, expecting ',' or '}'.
function buildMalformedGatewayResponse() {
  return Response.json({
    choices: [
      {
        message: {
          content:
            '{"candidates":[{"jokePattern":"deadpan diagnosis","jokeTarget":"platform leverage","referencedFact":"The rollout is framed as an operator productivity update.","shortRationale":"r","text":"the "cool" glasses"}]}',
        },
      },
    ],
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
