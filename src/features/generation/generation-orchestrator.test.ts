import { describe, expect, test, vi } from "vitest";
import { buildReplySignals } from "@/features/enrichment/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/features/tweet-retrieval/tweet-retrieval";
import {
  createLocalGenerationProviders,
  type GenerationProvider,
  orchestrateThreeProviderGeneration,
  type ProviderGenerationInput,
} from "./generation-orchestrator";

describe("generation orchestrator", () => {
  test("returns exactly one draft from each connected provider", async () => {
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/2468",
    );
    const run = await orchestrateThreeProviderGeneration(
      {
        replySignals: buildReplySignals(tweetContext),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "",
      },
      {
        providers: [
          buildProvider("openai"),
          buildProvider("anthropic"),
          buildProvider("google"),
        ],
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
    const fetcher = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
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
      },
    );
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/2468",
    );

    process.env.AI_GATEWAY_API_KEY = "gateway-secret";
    process.env.AI_GATEWAY_OPENAI_MODEL = "openai/launch";
    process.env.AI_GATEWAY_ANTHROPIC_MODEL = "anthropic/launch";
    process.env.AI_GATEWAY_GOOGLE_MODEL = "google/launch";
    delete process.env.VERCEL_AI_GATEWAY_API_KEY;
    globalThis.fetch = fetcher;

    try {
      const run = await orchestrateThreeProviderGeneration({
        replySignals: buildReplySignals(tweetContext),
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
          typeof body === "object" && body && "model" in body
            ? body.model
            : undefined,
        ),
      ).toEqual(["openai/launch", "anthropic/launch", "google/launch"]);
    } finally {
      restoreEnvValue("AI_GATEWAY_API_KEY", previousEnv.AI_GATEWAY_API_KEY);
      restoreEnvValue(
        "AI_GATEWAY_OPENAI_MODEL",
        previousEnv.AI_GATEWAY_OPENAI_MODEL,
      );
      restoreEnvValue(
        "AI_GATEWAY_ANTHROPIC_MODEL",
        previousEnv.AI_GATEWAY_ANTHROPIC_MODEL,
      );
      restoreEnvValue(
        "AI_GATEWAY_GOOGLE_MODEL",
        previousEnv.AI_GATEWAY_GOOGLE_MODEL,
      );
      restoreEnvValue(
        "VERCEL_AI_GATEWAY_API_KEY",
        previousEnv.VERCEL_AI_GATEWAY_API_KEY,
      );
      globalThis.fetch = previousFetch;
    }
  });

  test("keeps drafts short and covers the user's direction when relevant", async () => {
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/2468",
    );
    const run = await orchestrateThreeProviderGeneration(
      {
        replySignals: buildReplySignals(tweetContext),
        sourceTweet: tweetContext.sourceTweet,
        sourceTweetUrl: tweetContext.sourceTweet.url,
        usersDirection: "Make the platform-risk angle sharper.",
      },
      { providers: createLocalGenerationProviders() },
    );

    expect(run.drafts.every((draft) => draft.text.length <= 280)).toBe(true);
    expect(
      run.drafts.every((draft) =>
        draft.visibleRationale.includes("Direction covered"),
      ),
    ).toBe(true);
    expect(new Set(run.drafts.map((draft) => draft.angle)).size).toBe(3);
  });

  test("uses provider fallback to preserve a complete three-draft run", async () => {
    const tweetContext = buildFixtureTweetContext(
      "https://x.com/siliconmania/status/2468",
    );
    const run = await orchestrateThreeProviderGeneration(
      {
        replySignals: buildReplySignals(tweetContext),
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
    expect(
      run.drafts.filter((draft) => draft.provider === "openai"),
    ).toHaveLength(2);
  });
});

function buildProvider(
  id: GenerationProvider["id"],
  { shouldFail = false }: { shouldFail?: boolean } = {},
): GenerationProvider {
  const displayNames: Record<
    GenerationProvider["id"],
    GenerationProvider["displayName"]
  > = {
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
