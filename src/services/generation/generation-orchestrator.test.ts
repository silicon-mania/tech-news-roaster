import { describe, expect, test, vi } from "vitest";
import { parseJokeContextSnapshot } from "@/services/generation";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import {
  createLocalGenerationProviders,
  type GenerationProvider,
  orchestrateThreeProviderGeneration,
  type ProviderGenerationInput,
} from "./generation-orchestrator";

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
      },
    );

    expect(run).toMatchObject({
      label: "Drafts for 2468",
      drafts: [
        expect.objectContaining({ provider: "openai" }),
        expect.objectContaining({ provider: "anthropic" }),
        expect.objectContaining({ provider: "google" }),
      ],
    });
    expect(run.drafts).toHaveLength(3);
    expect(new Set(run.drafts.map((draft) => draft.angle)).size).toBe(3);
    expect(run.fallbackDisclosure).toBeUndefined();
    // The orchestrator no longer runs Visual Joke Generation: the run carries no
    // Visual Joke Set and the stage stays "not-started".
    expect(run.visualJokeSet).toBeUndefined();
    expect(run.generationResultStates?.visualJokeGeneration).toEqual({ status: "not-started" });
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
      const run = await orchestrateThreeProviderGeneration({
        jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "",
      });

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
      await orchestrateThreeProviderGeneration({
        jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "Make the platform-risk angle sharper.",
      });

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
      const run = await orchestrateThreeProviderGeneration({
        jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "",
      });

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

  test("counts a timed-out text provider as a failed provider and still completes via fallback", async () => {
    const previousEnv = {
      AI_GATEWAY_ANTHROPIC_MODEL: process.env.AI_GATEWAY_ANTHROPIC_MODEL,
      AI_GATEWAY_API_KEY: process.env.AI_GATEWAY_API_KEY,
      AI_GATEWAY_GOOGLE_MODEL: process.env.AI_GATEWAY_GOOGLE_MODEL,
      AI_GATEWAY_OPENAI_MODEL: process.env.AI_GATEWAY_OPENAI_MODEL,
      AI_GATEWAY_TEXT_TIMEOUT_MS: process.env.AI_GATEWAY_TEXT_TIMEOUT_MS,
      VERCEL_AI_GATEWAY_API_KEY: process.env.VERCEL_AI_GATEWAY_API_KEY,
    };
    const previousFetch = globalThis.fetch;
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      const body = JSON.parse(String(init?.body)) as { model?: string };

      // The Anthropic provider goes silent; only the hard timeout ends its call.
      if (body.model === "anthropic/model") {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject((init.signal as AbortSignal).reason),
          );
        });
      }

      return Promise.resolve(
        Response.json({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  angle: "configured model",
                  text: "Quote-tweet draft: surviving provider covers the slot.",
                  visibleRationale: "Surviving provider keeps the set complete.",
                }),
              },
            },
          ],
        }),
      );
    });
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_OPENAI_MODEL = "openai/model";
    process.env.AI_GATEWAY_ANTHROPIC_MODEL = "anthropic/model";
    process.env.AI_GATEWAY_GOOGLE_MODEL = "google/model";
    process.env.AI_GATEWAY_TEXT_TIMEOUT_MS = "50";
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    globalThis.fetch = fetcher;

    try {
      const run = await orchestrateThreeProviderGeneration({
        jokeContextSnapshot: buildJokeContextSnapshot(tweetContext.sourceTweet.id),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "",
      });

      expect(run.drafts).toHaveLength(3);
      expect(run.drafts[1]).toMatchObject({
        fallbackForProvider: "anthropic",
        provider: "openai",
      });
      expect(run.fallbackDisclosure).toContain("Anthropic");
      expect(run.generationResultStates?.textGeneration.status).toBe("completed");
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousEnv.AI_GATEWAY_API_KEY);
      restoreEnvValue("AI_GATEWAY_OPENAI_MODEL", previousEnv.AI_GATEWAY_OPENAI_MODEL);
      restoreEnvValue("AI_GATEWAY_ANTHROPIC_MODEL", previousEnv.AI_GATEWAY_ANTHROPIC_MODEL);
      restoreEnvValue("AI_GATEWAY_GOOGLE_MODEL", previousEnv.AI_GATEWAY_GOOGLE_MODEL);
      restoreEnvValue("AI_GATEWAY_TEXT_TIMEOUT_MS", previousEnv.AI_GATEWAY_TEXT_TIMEOUT_MS);
      restoreEnvValue("VERCEL_AI_GATEWAY_API_KEY", previousEnv.VERCEL_AI_GATEWAY_API_KEY);
      globalThis.fetch = previousFetch;
    }
  });

  test("rejects when every text provider fails, since there is no other creative area", async () => {
    const tweetContext = buildFixtureTweetContext("https://x.com/siliconmania/status/2468");

    // With Visual Joke Generation removed, Text Generation is the orchestrator's
    // only Creative Result Area — a total text failure has no joke set to fall back
    // on, so it rejects and the stream/composition handle the failed run.
    await expect(
      orchestrateThreeProviderGeneration(
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
        },
      ),
    ).rejects.toThrow();
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
