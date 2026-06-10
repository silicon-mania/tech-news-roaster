import { describe, expect, test, vi } from "vitest";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import { parseJokeContextSnapshot } from "./generation-events";
import {
  createLocalGenerationProviders,
  type GenerationProvider,
  orchestrateThreeProviderGeneration,
  type ProviderGenerationInput,
} from "./generation-orchestrator";
import { defaultVisualJokeDirection } from "./visual-joke-service";

describe("generation orchestrator", () => {
  test("returns exactly one draft from each connected provider", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const run = await orchestrateThreeProviderGeneration(
      {
        jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "",
      },
      {
        providers: [buildProvider("openai"), buildProvider("anthropic"), buildProvider("google")],
        visualJokeProvider: buildVisualJokeProvider(),
      },
    );

    expect(run).toMatchObject({
      label: "Drafts for 2468",
      drafts: [
        expect.objectContaining({ provider: "openai" }),
        expect.objectContaining({ provider: "anthropic" }),
        expect.objectContaining({ provider: "google" }),
      ],
      visualJokeDirection: defaultVisualJokeDirection,
      visualJokeSet: {
        jokes: expect.arrayContaining([expect.objectContaining({ recommended: true, rank: 1 })]),
      },
    });
    expect(run.drafts).toHaveLength(3);
    expect(new Set(run.drafts.map((draft) => draft.angle)).size).toBe(3);
    expect(run.fallbackDisclosure).toBeUndefined();
  });

  test("uses configured AI Gateway model IDs as completed draft provenance", async () => {
    const previousEnv = {
      AI_GATEWAY_ANTHROPIC_MODEL: process.env.AI_GATEWAY_ANTHROPIC_MODEL,
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      AI_GATEWAY_GOOGLE_MODEL: process.env.AI_GATEWAY_GOOGLE_MODEL,
      AI_GATEWAY_OPENAI_MODEL: process.env.AI_GATEWAY_OPENAI_MODEL,
      VERCEL_AI_GATEWAY_API_KEY: process.env.VERCEL_AI_GATEWAY_API_KEY,
    };
    const previousFetch = globalThis.fetch;
    const gatewayBodies: unknown[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      gatewayBodies.push(JSON.parse(String(init?.body)));

      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                angle: "configured model",
                text: "Quote-tweet draft: configured model provenance.",
                visibleRationale: "Shows configured model provenance.",
              }),
            },
          },
        ],
      });
    });
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_OPENAI_MODEL = "openai/launch";
    process.env.AI_GATEWAY_ANTHROPIC_MODEL = "anthropic/launch";
    process.env.AI_GATEWAY_GOOGLE_MODEL = "google/launch";
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    globalThis.fetch = fetcher;

    try {
      const run = await orchestrateThreeProviderGeneration(
        {
          jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
          sourceTweet: tweetContext.sourceTweet,
          sourceTweetUrl: tweetContext.sourceTweet.url,
          usersDirection: "",
        },
        {
          visualJokeProvider: buildVisualJokeProvider(),
        },
      );

      expect(run.drafts.map((draft) => draft.modelProvenance)).toEqual([
        "openai/launch",
        "anthropic/launch",
        "google/launch",
      ]);
      expect(
        gatewayBodies.map((body) =>
          typeof body === "object" && body && "model" in body ? body.model : undefined,
        ),
      ).toEqual(["openai/launch", "anthropic/launch", "google/launch"]);
      expect(
        gatewayBodies.every(
          (body) => typeof body === "object" && body && !("response_format" in body),
        ),
      ).toBe(true);
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousEnv.AI_GATEWAY_API_KEY);
      restoreEnvValue("AI_GATEWAY_OPENAI_MODEL", previousEnv.AI_GATEWAY_OPENAI_MODEL);
      restoreEnvValue("AI_GATEWAY_ANTHROPIC_MODEL", previousEnv.AI_GATEWAY_ANTHROPIC_MODEL);
      restoreEnvValue("AI_GATEWAY_GOOGLE_MODEL", previousEnv.AI_GATEWAY_GOOGLE_MODEL);
      restoreEnvValue("VERCEL_AI_GATEWAY_API_KEY", previousEnv.VERCEL_AI_GATEWAY_API_KEY);
      globalThis.fetch = previousFetch;
    }
  });

  test("passes the joke context snapshot and User's Direction into text provider prompts", async () => {
    const previousEnv = {
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      VERCEL_AI_GATEWAY_API_KEY: process.env.VERCEL_AI_GATEWAY_API_KEY,
    };
    const previousFetch = globalThis.fetch;
    const gatewayPrompts: unknown[] = [];
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        messages?: Array<{ content?: string; role?: string }>;
      };
      const userMessage = body.messages?.find((message) => message.role === "user");

      gatewayPrompts.push(JSON.parse(String(userMessage?.content)));

      return Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                angle: "directional read",
                text: "Quote-tweet draft: direction and context shape the read.",
                visibleRationale: "Uses the snapshot and the user's direction for the text draft.",
              }),
            },
          },
        ],
      });
    });
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    globalThis.fetch = fetcher;

    try {
      await orchestrateThreeProviderGeneration(
        {
          jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
          sourceTweet: tweetContext.sourceTweet,
          sourceTweetUrl: tweetContext.sourceTweet.url,
          usersDirection: "Make the platform-risk angle sharper.",
        },
        {
          visualJokeProvider: buildVisualJokeProvider(),
        },
      );

      expect(gatewayPrompts).toHaveLength(3);
      expect(gatewayPrompts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            jokeContextSnapshot: expect.objectContaining({
              sourceTweetId: tweetContext.sourceTweet.id,
            }),
            usersDirection: "Make the platform-risk angle sharper.",
          }),
        ]),
      );
      expect(
        gatewayPrompts.every((prompt) => !("replySignals" in (prompt as Record<string, unknown>))),
      ).toBe(true);
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousEnv.AI_GATEWAY_API_KEY);
      restoreEnvValue("VERCEL_AI_GATEWAY_API_KEY", previousEnv.VERCEL_AI_GATEWAY_API_KEY);
      globalThis.fetch = previousFetch;
    }
  });

  test("extracts fenced gateway JSON and trims overlong draft text", async () => {
    const previousEnv = {
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      VERCEL_AI_GATEWAY_API_KEY: process.env.VERCEL_AI_GATEWAY_API_KEY,
    };
    const previousFetch = globalThis.fetch;
    const fetcher = vi.fn(async () =>
      Response.json({
        choices: [
          {
            message: {
              content: `Here is the draft:\n\n\`\`\`json\n${JSON.stringify({
                angle: "long but usable",
                draft: `Quote-tweet draft: ${"sharp ".repeat(80)}`,
                editorial_note: "Extra provider field should be ignored.",
                visible_rationale: "Keeps the output contract stable.",
              })}\n\`\`\``,
            },
          },
        ],
      }),
    );
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    globalThis.fetch = fetcher;

    try {
      const run = await orchestrateThreeProviderGeneration(
        {
          jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
          sourceTweet: tweetContext.sourceTweet,
          sourceTweetUrl: tweetContext.sourceTweet.url,
          usersDirection: "",
        },
        {
          visualJokeProvider: buildVisualJokeProvider(),
        },
      );

      expect(run.drafts).toHaveLength(3);
      expect(run.drafts.every((draft) => draft.text.length <= 280)).toBe(true);
      expect(run.drafts[0]).toMatchObject({
        angle: "long but usable",
        visibleRationale: "Keeps the output contract stable.",
      });
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousEnv.AI_GATEWAY_API_KEY);
      restoreEnvValue("VERCEL_AI_GATEWAY_API_KEY", previousEnv.VERCEL_AI_GATEWAY_API_KEY);
      globalThis.fetch = previousFetch;
    }
  });

  test("keeps drafts short and covers the user's direction when relevant", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const run = await orchestrateThreeProviderGeneration(
      {
        jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "Make the platform-risk angle sharper.",
      },
      {
        providers: createLocalGenerationProviders(),
        visualJokeProvider: buildVisualJokeProvider(),
      },
    );

    expect(run.drafts.every((draft) => draft.text.length <= 280)).toBe(true);
    expect(run.drafts.every((draft) => draft.visibleRationale.includes("Direction covered"))).toBe(
      true,
    );
    expect(new Set(run.drafts.map((draft) => draft.angle)).size).toBe(3);
  });

  test("uses provider fallback to preserve a complete three-draft run", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const run = await orchestrateThreeProviderGeneration(
      {
        jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "",
      },
      {
        providers: [
          buildProvider("openai"),
          buildProvider("anthropic", { shouldFail: true }),
          buildProvider("google"),
        ],
        visualJokeProvider: buildVisualJokeProvider(),
      },
    );

    expect(run.drafts).toHaveLength(3);
    expect(run.drafts[1]).toMatchObject({
      fallbackForProvider: "anthropic",
      provider: "openai",
      modelProvenance: "test-model (fallback for Anthropic)",
    });
    expect(run.fallbackDisclosure).toContain("Anthropic");
    expect(run.drafts.filter((draft) => draft.provider === "openai")).toHaveLength(2);
  });

  test("keeps the run successful when text generation fails but visual jokes succeed", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const run = await orchestrateThreeProviderGeneration(
      {
        jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "",
      },
      {
        providers: [
          buildProvider("openai", { shouldFail: true }),
          buildProvider("anthropic", { shouldFail: true }),
          buildProvider("google", { shouldFail: true }),
        ],
        visualJokeProvider: buildVisualJokeProvider(),
      },
    );

    expect(run.drafts).toEqual([]);
    expect(run.generationResultStates).toMatchObject({
      textGeneration: {
        message: "Text generation could not produce a usable draft set.",
        status: "failed",
      },
      visualJokeGeneration: {
        status: "completed",
      },
    });
    expect(run.visualJokeSet?.jokes).toHaveLength(8);
  });

  test("keeps the run successful when visual joke generation fails but text succeeds", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");
    const run = await orchestrateThreeProviderGeneration(
      {
        jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "",
      },
      {
        providers: [buildProvider("openai"), buildProvider("anthropic"), buildProvider("google")],
        visualJokeProvider: {
          model: "test-model",
          provider: "test",
          async generateCandidates() {
            throw new Error("Visual joke provider failed.");
          },
        },
      },
    );

    expect(run.drafts).toHaveLength(3);
    expect(run.generationResultStates).toMatchObject({
      textGeneration: {
        status: "completed",
      },
      visualJokeGeneration: {
        message: "Visual joke generation could not produce a publishable joke set.",
        status: "failed",
      },
    });
    expect(run.visualJokeSet).toBeUndefined();
  });
});

function buildProvider(
  id: GenerationProvider["id"],
  { shouldFail = false }: { shouldFail?: boolean } = {},
): GenerationProvider {
  const displayNames: Record<GenerationProvider["id"], GenerationProvider["displayName"]> = {
    anthropic: "Anthropic",
    google: "Google",
    openai: "OpenAI",
  };

  return {
    displayName: displayNames[id],
    id,
    model: "test-model",
    async generate(input: ProviderGenerationInput) {
      if (shouldFail && !input.fallbackForProvider) {
        throw new Error(`${id} failed.`);
      }

      return {
        angle: input.angle,
        model: "test-model",
        text: `Quote-tweet draft: ${displayNames[id]} covers ${input.angle} for ${input.sourceTweet.id}.`,
        visibleRationale: `Explains the ${input.angle} angle.`,
      };
    },
  };
}

function restoreEnvValue(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}

function buildVisualJokeProvider() {
  return {
    model: "test-visual-joke-model",
    provider: "test" as const,
    async generateCandidates() {
      return [
        buildVisualJokeCandidate("OpenAI Ships The Pricing Shortcut", "truthful misdirection"),
        buildVisualJokeCandidate("Workflow Lock-In With Better Lighting", "dark tech satire"),
        buildVisualJokeCandidate("Roadmap As A Service", "tech-native metaphor"),
        buildVisualJokeCandidate("OpenAI Premium Coordination Cloud", "fake product naming"),
        buildVisualJokeCandidate("The Moat Is The Workflow", "deadpan diagnosis"),
        buildVisualJokeCandidate("Every Launch Is A Billing Event", "incentive roast"),
        buildVisualJokeCandidate("Breaking: The Dashboard Needs A Manager", "absurd headline"),
        buildVisualJokeCandidate("OpenAI Wants Rent On Your Entire Workflow", "earned edge"),
      ];
    },
  };
}

function buildVisualJokeCandidate(text: string, jokePattern: string) {
  return {
    metadata: {
      jokePattern,
      jokeTarget: "platform leverage",
      referencedFact: "The rollout is framed as an operator productivity update.",
      shortRationale: "Turns the feature reveal into a pricing-pressure punchline.",
    },
    text,
  };
}

function buildJokeContextSnapshot(sourceTweetId: string) {
  return parseJokeContextSnapshot({
    capturedAt: "2026-06-06T10:10:00.000Z",
    sourceTweetId,
    structuredContext: {
      authorContext: {
        authoritySignals: ["Operator is close to the launch."],
        displayName: "Silicon Mania",
        handle: "@siliconmania",
        relationshipToTopic: "Announcing its own workflow launch.",
      },
      forbiddenAssumptions: ["Do not invent missing product details."],
      jokeContextQuality: {
        status: "usable" as const,
        summary: "Enough context exists to support grounded jokes.",
      },
      jokeableTensions: ["The launch promises simplicity while increasing platform dependence."],
      replySignals: {
        representativeSnippets: [
          {
            authorHandle: "@replyguy",
            replyId: `${sourceTweetId}-reply-1`,
            signal: "Audience reads this as workflow lock-in.",
            snippet: "Cool, now every workflow starts looking locked in.",
          },
        ],
        summary: "Replies focus on workflow lock-in and operator pressure.",
      },
      sourceTweetClaim: "The source tweet claims the launch removes the final workflow bottleneck.",
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
