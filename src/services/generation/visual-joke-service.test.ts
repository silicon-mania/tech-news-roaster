import { describe, expect, test, vi } from "vitest";
import { defaultVisualJokeDirection, parseJokeContextSnapshot } from "@/services/generation";
import {
  generateVisualJokeSet,
  parseGatewayVisualJokeOutput,
  type VisualJokeCandidateOutput,
  VisualJokeGenerationError,
} from "./visual-joke-service";

const serviceInput = {
  jokeContextSnapshot: buildJokeContextSnapshot(),
  visualJokeDirection: defaultVisualJokeDirection,
};

function fakeProvider(output: VisualJokeCandidateOutput) {
  return {
    model: "test-model",
    provider: "test" as const,
    async generateCandidates() {
      return output;
    },
  };
}

describe("visual joke service", () => {
  test("assembles categorized output with assigned ids and within-section order", async () => {
    const result = await generateVisualJokeSet(serviceInput, {
      now: () => new Date("2026-06-06T10:12:00.000Z"),
      // Sections arrive interleaved to prove the service regroups them.
      provider: fakeProvider({
        jokes: [
          { section: "tech-positive", text: "Tech positive one" },
          { section: "satire", text: "Satire one" },
          { section: "experimental", text: "Experimental one" },
          { section: "satire", text: "Satire two" },
          { section: "tech-positive", text: "Tech positive two" },
        ],
        topPicks: [
          { reason: "Best satire.", section: "satire", text: "Satire one" },
          { reason: "Best tech-positive.", section: "tech-positive", text: "Tech positive one" },
        ],
      }),
    });

    expect(result.visualJokeDirection).toBe(defaultVisualJokeDirection);
    expect(result.visualJokeSet).toMatchObject({
      generatedAt: "2026-06-06T10:12:00.000Z",
      id: "visual-joke-set-1",
      targetPerSection: 7,
    });
    expect(result.visualJokeSet.jokes).toEqual([
      { id: "visual-joke-1", order: 1, section: "satire", text: "Satire one" },
      { id: "visual-joke-2", order: 2, section: "satire", text: "Satire two" },
      { id: "visual-joke-3", order: 1, section: "tech-positive", text: "Tech positive one" },
      { id: "visual-joke-4", order: 2, section: "tech-positive", text: "Tech positive two" },
      { id: "visual-joke-5", order: 1, section: "experimental", text: "Experimental one" },
    ]);
    // Top picks resolve to the assigned ids, in order.
    expect(result.visualJokeSet.topPicks).toEqual([
      { reason: "Best satire.", visualJokeId: "visual-joke-1" },
      { reason: "Best tech-positive.", visualJokeId: "visual-joke-3" },
    ]);
  });

  test("caps each section at the target and trims joke text", async () => {
    const result = await generateVisualJokeSet(serviceInput, {
      provider: fakeProvider({
        jokes: [
          ...Array.from({ length: 9 }, (_value, index) => ({
            section: "satire" as const,
            text: `  Satire ${index + 1}  `,
          })),
        ],
        topPicks: [{ reason: "Pick.", section: "satire", text: "Satire 1" }],
      }),
    });

    const satire = result.visualJokeSet.jokes.filter((joke) => joke.section === "satire");
    expect(satire).toHaveLength(7);
    expect(satire[0].text).toBe("Satire 1");
    expect(satire.map((joke) => joke.order)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  test("drops an unmatchable top pick while keeping the matched ones", async () => {
    const result = await generateVisualJokeSet(serviceInput, {
      provider: fakeProvider({
        jokes: [
          { section: "satire", text: "Satire one" },
          { section: "satire", text: "Satire two" },
        ],
        topPicks: [
          { reason: "Real.", section: "satire", text: "Satire two" },
          { reason: "Ghost.", section: "satire", text: "Does not exist" },
        ],
      }),
    });

    expect(result.visualJokeSet.topPicks).toEqual([
      { reason: "Real.", visualJokeId: "visual-joke-2" },
    ]);
  });

  test("falls back to the first joke as sole top pick when none match", async () => {
    const result = await generateVisualJokeSet(serviceInput, {
      provider: fakeProvider({
        jokes: [
          { section: "satire", text: "Satire one" },
          { section: "tech-positive", text: "Tech positive one" },
        ],
        topPicks: [{ reason: "Ghost.", section: "satire", text: "Nope" }],
      }),
    });

    expect(result.visualJokeSet.topPicks).toHaveLength(1);
    expect(result.visualJokeSet.topPicks[0].visualJokeId).toBe("visual-joke-1");
  });

  test("ships the surviving sections when one section returns nothing", async () => {
    const result = await generateVisualJokeSet(serviceInput, {
      provider: fakeProvider({
        jokes: [
          { section: "satire", text: "Only satire" },
          { section: "experimental", text: "Only experimental" },
        ],
        topPicks: [{ reason: "Pick.", section: "satire", text: "Only satire" }],
      }),
    });

    // tech-positive returned nothing; the set still ships with the other two.
    expect(result.visualJokeSet.jokes.map((joke) => joke.section)).toEqual([
      "satire",
      "experimental",
    ]);
  });

  test("throws with a debug log when the whole set is empty", async () => {
    const error = await generateVisualJokeSet(serviceInput, {
      provider: fakeProvider({ jokes: [], topPicks: [] }),
    }).catch((thrown: unknown) => thrown);

    expect(error).toBeInstanceOf(VisualJokeGenerationError);
    expect((error as VisualJokeGenerationError).debugLog ?? []).toEqual(
      expect.arrayContaining([
        "Step: assemble-visual-joke-set",
        "Provider: test/test-model",
        expect.stringContaining("No publishable visual jokes"),
      ]),
    );
  });

  test("does not retry or fall back when the configured provider fails", async () => {
    const provider = {
      model: "test-model",
      provider: "test" as const,
      generateCandidates: vi.fn(async () => {
        throw new Error("Provider exploded.");
      }),
    };

    await expect(generateVisualJokeSet(serviceInput, { provider })).rejects.toThrow(
      "Provider exploded.",
    );
    expect(provider.generateCandidates).toHaveBeenCalledTimes(1);
  });

  test("uses the offline local provider to produce a usable 3-section set", async () => {
    const previousApiKey = process.env.AI_GATEWAY_API_KEY;
    const previousVercelKey = process.env.VERCEL_AI_GATEWAY_API_KEY;
    // With no gateway credentials and a non-production env, the default provider is
    // the local one, so the workflow runs entirely offline.
    delete process.env.AI_GATEWAY_API_KEY;
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;

    try {
      const result = await generateVisualJokeSet(serviceInput);

      expect(new Set(result.visualJokeSet.jokes.map((joke) => joke.section))).toEqual(
        new Set(["satire", "tech-positive", "experimental"]),
      );
      expect(result.visualJokeSet.jokes.length).toBeGreaterThanOrEqual(3);
      expect(result.visualJokeSet.topPicks.length).toBeGreaterThanOrEqual(1);
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousApiKey);
      restoreEnvValue("VERCEL_AI_GATEWAY_API_KEY", previousVercelKey);
    }
  });

  test("sends only the joke context snapshot and visual joke direction to the AI Gateway prompt", async () => {
    const previousApiKey = process.env.AI_GATEWAY_API_KEY;
    const previousModel = process.env.AI_GATEWAY_VISUAL_JOKE_MODEL;
    const previousFetch = globalThis.fetch;
    const fetcher = vi.fn<typeof fetch>(async () => buildValidGatewayResponse());

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

      expect(result.visualJokeSet.jokes).toHaveLength(4);
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

      expect(result.visualJokeSet.jokes).toHaveLength(4);
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
});

describe("parseGatewayVisualJokeOutput", () => {
  test("maps a well-formed gateway payload to the categorized provider output", () => {
    const output = parseGatewayVisualJokeOutput(
      JSON.stringify({
        jokes: [
          { section: "satire", text: "OpenAI Ships The Pricing Shortcut" },
          { section: "tech-positive", text: "The Haters Discover The Roadmap Was Real" },
          { section: "experimental", text: "2037: the bottleneck files for emancipation" },
        ],
        topPicks: [
          {
            reason: "Names the actor and the incentive in one line.",
            section: "satire",
            text: "OpenAI Ships The Pricing Shortcut",
          },
        ],
      }),
    );

    expect(output).toEqual({
      jokes: [
        { section: "satire", text: "OpenAI Ships The Pricing Shortcut" },
        { section: "tech-positive", text: "The Haters Discover The Roadmap Was Real" },
        { section: "experimental", text: "2037: the bottleneck files for emancipation" },
      ],
      topPicks: [
        {
          reason: "Names the actor and the incentive in one line.",
          section: "satire",
          text: "OpenAI Ships The Pricing Shortcut",
        },
      ],
    });
  });

  test("tolerates code fences and surrounding prose around the JSON object", () => {
    const output = parseGatewayVisualJokeOutput(
      'Here you go:\n```json\n{"jokes":[{"section":"satire","text":"A joke"}],"topPicks":[]}\n```',
    );

    expect(output.jokes).toEqual([{ section: "satire", text: "A joke" }]);
    expect(output.topPicks).toEqual([]);
  });

  test("keeps a headline that runs past the old twelve-word cap", () => {
    const longHeadline =
      "Everyone who laughed at landing rockets now quietly needs them in their own index fund anyway";
    expect(longHeadline.split(/\s+/)).toHaveLength(16);

    const output = parseGatewayVisualJokeOutput(
      JSON.stringify({
        jokes: [{ section: "tech-positive", text: longHeadline }],
        topPicks: [],
      }),
    );

    expect(output.jokes).toEqual([{ section: "tech-positive", text: longHeadline }]);
  });

  test("throws on a malformed JSON payload so the adapter can repair-retry", () => {
    expect(() =>
      parseGatewayVisualJokeOutput('{"jokes":[{"section":"satire","text":"the "cool" glasses"}]}'),
    ).toThrow();
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
            jokes: [
              { section: "satire", text: "OpenAI Ships The Pricing Shortcut" },
              { section: "satire", text: "Every Launch Is A Billing Event" },
              { section: "tech-positive", text: "The Haters Discover The Roadmap Was Real" },
              { section: "experimental", text: "2037: the bottleneck files for emancipation" },
            ],
            topPicks: [
              {
                reason: "Names the actor and the incentive in one line.",
                section: "satire",
                text: "OpenAI Ships The Pricing Shortcut",
              },
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
          content: '{"jokes":[{"section":"satire","text":"the "cool" glasses"}],"topPicks":[]}',
        },
      },
    ],
  });
}

function restoreEnvValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
