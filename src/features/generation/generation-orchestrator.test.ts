import { describe, expect, test } from "vitest";
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
      modelProvenance: "OpenAI test-model (fallback for Anthropic)",
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
