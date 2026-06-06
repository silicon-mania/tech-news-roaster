import { z } from "zod";
import type {
  OutsideXEnrichmentContext,
  ReplySignal,
} from "@/features/enrichment/outside-x-enrichment";
import type { RetrievedSourceTweet } from "@/features/tweet-retrieval/tweet-retrieval";
import {
  readConfiguredAiGatewayModels,
  readEnvValue,
} from "./ai-gateway-models";
import {
  type CompletedGenerationRunPayload,
  type GenerationProviderId,
  generationProviderIds,
  parseCompletedGenerationRunPayload,
  type QuoteTweetDraft,
} from "./generation-events";

type GenerationProviderOutput = {
  angle: string;
  model: string;
  text: string;
  visibleRationale: string;
};

export type GenerationProvider = {
  displayName: "OpenAI" | "Anthropic" | "Google";
  id: GenerationProviderId;
  model: string;
  generate(input: ProviderGenerationInput): Promise<GenerationProviderOutput>;
};

export type ProviderGenerationInput = {
  angle: string;
  enrichmentContext?: OutsideXEnrichmentContext;
  fallbackForProvider?: GenerationProviderId;
  replySignals: ReplySignal[];
  sourceTweet: RetrievedSourceTweet;
  targetProviderId: GenerationProviderId;
  usersDirection: string;
};

export type GenerationOrchestratorInput = {
  enrichmentContext?: OutsideXEnrichmentContext;
  replySignals: ReplySignal[];
  sourceTweet: RetrievedSourceTweet;
  sourceTweetUrl: string;
  usersDirection: string;
};

export type GenerationOrchestrator = (
  input: GenerationOrchestratorInput,
) => Promise<CompletedGenerationRunPayload>;

type GenerationOrchestratorOptions = {
  providers?: GenerationProvider[];
};

const gatewayResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string().min(1),
        }),
      }),
    )
    .min(1),
});

const providerJsonOutputSchema = z
  .object({
    angle: z.string().min(1),
    text: z.string().min(1).max(280),
    visibleRationale: z.string().min(1),
  })
  .strict();

const providerDisplayNames: Record<
  GenerationProviderId,
  GenerationProvider["displayName"]
> = {
  anthropic: "Anthropic",
  google: "Google",
  openai: "OpenAI",
};

const primaryAngles: Record<GenerationProviderId, string> = {
  anthropic: "incentive shift",
  google: "distribution bet",
  openai: "platform leverage",
};

const fallbackAngles: Record<GenerationProviderId, string> = {
  anthropic: "operator pressure",
  google: "market timing",
  openai: "roadmap pressure",
};

export async function orchestrateThreeProviderGeneration(
  input: GenerationOrchestratorInput,
  options: GenerationOrchestratorOptions = {},
): Promise<CompletedGenerationRunPayload> {
  const providers = options.providers ?? createDefaultGenerationProviders();
  const providerById = new Map(
    providers.map((provider) => [provider.id, provider]),
  );
  const providerResults = await Promise.allSettled(
    generationProviderIds.map(async (providerId) => {
      const provider = providerById.get(providerId);

      if (!provider) {
        throw new Error(`Missing ${providerId} generation provider.`);
      }

      const output = await provider.generate({
        ...input,
        angle: primaryAngles[providerId],
        targetProviderId: providerId,
      });

      return buildDraft({
        output,
        provider,
        targetProviderId: providerId,
      });
    }),
  );
  const draftBySlot = new Map<GenerationProviderId, QuoteTweetDraft>();
  const successfulProviders: GenerationProvider[] = [];
  const failedProviderIds: GenerationProviderId[] = [];

  providerResults.forEach((result, index) => {
    const providerId = generationProviderIds[index];

    if (result.status === "fulfilled") {
      draftBySlot.set(providerId, result.value);
      const provider = providerById.get(providerId);

      if (provider) {
        successfulProviders.push(provider);
      }
      return;
    }

    failedProviderIds.push(providerId);
  });

  for (const [index, failedProviderId] of failedProviderIds.entries()) {
    const fallbackProvider = successfulProviders.at(
      index % successfulProviders.length,
    );

    if (!fallbackProvider) {
      throw new Error("No generation provider completed successfully.");
    }

    const output = await fallbackProvider.generate({
      ...input,
      angle: fallbackAngles[failedProviderId],
      fallbackForProvider: failedProviderId,
      targetProviderId: failedProviderId,
    });

    draftBySlot.set(
      failedProviderId,
      buildDraft({
        fallbackForProvider: failedProviderId,
        output,
        provider: fallbackProvider,
        targetProviderId: failedProviderId,
      }),
    );
  }

  const drafts = generationProviderIds.map((providerId) => {
    const draft = draftBySlot.get(providerId);

    if (!draft) {
      throw new Error(`Missing ${providerId} draft.`);
    }

    return draft;
  });
  const fallbackDisclosure =
    failedProviderIds.length > 0
      ? `Provider fallback used for ${failedProviderIds
          .map((providerId) => providerDisplayNames[providerId])
          .join(", ")}; duplicate model provenance is shown on affected drafts.`
      : undefined;

  return parseCompletedGenerationRunPayload({
    fallbackDisclosure,
    label: buildRunLabel(input.sourceTweetUrl),
    sourceTweet: input.sourceTweet,
    drafts,
  });
}

function createDefaultGenerationProviders(): GenerationProvider[] {
  const gatewayKey = readAiGatewayApiKey();

  if (!gatewayKey && process.env.NODE_ENV !== "production") {
    return createLocalGenerationProviders();
  }

  const configuredModels = readConfiguredAiGatewayModels(process.env);

  return [
    createGatewayGenerationProvider({
      displayName: "OpenAI",
      id: "openai",
      model: configuredModels.openai,
    }),
    createGatewayGenerationProvider({
      displayName: "Anthropic",
      id: "anthropic",
      model: configuredModels.anthropic,
    }),
    createGatewayGenerationProvider({
      displayName: "Google",
      id: "google",
      model: configuredModels.google,
    }),
  ];
}

export function createLocalGenerationProviders(): GenerationProvider[] {
  return generationProviderIds.map((providerId) => ({
    displayName: providerDisplayNames[providerId],
    id: providerId,
    model: "local draft model",
    async generate(input) {
      return {
        angle: input.angle,
        model: "local draft model",
        text: enforceAttentionLength(buildLocalDraftText(input)),
        visibleRationale: buildLocalVisibleRationale(input),
      };
    },
  }));
}

function createGatewayGenerationProvider({
  displayName,
  id,
  model,
}: {
  displayName: GenerationProvider["displayName"];
  id: GenerationProviderId;
  model: string;
}): GenerationProvider {
  return {
    displayName,
    id,
    model,
    async generate(input) {
      const apiKey = readAiGatewayApiKey();

      if (!apiKey) {
        throw new Error("AI Gateway credentials are not configured.");
      }

      const gatewayBaseUrl =
        process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1";
      const response = await fetch(
        `${gatewayBaseUrl.replace(/\/$/, "")}/chat/completions`,
        {
          body: JSON.stringify({
            messages: [
              {
                content:
                  "You write sharp English quote-tweet candidates for tech-news commentary. Return only JSON.",
                role: "system",
              },
              {
                content: buildProviderPrompt(input),
                role: "user",
              },
            ],
            model,
            response_format: { type: "json_object" },
            temperature: 0.8,
          }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
        },
      );

      if (!response.ok) {
        throw new Error(`${displayName} generation failed.`);
      }

      const payload = gatewayResponseSchema.parse(await response.json());
      const parsedOutput = providerJsonOutputSchema.parse(
        JSON.parse(stripJsonFences(payload.choices[0].message.content)),
      );

      return {
        ...parsedOutput,
        model,
      };
    },
  };
}

function buildDraft({
  fallbackForProvider,
  output,
  provider,
  targetProviderId,
}: {
  fallbackForProvider?: GenerationProviderId;
  output: GenerationProviderOutput;
  provider: GenerationProvider;
  targetProviderId: GenerationProviderId;
}): QuoteTweetDraft {
  const targetDisplayName = providerDisplayNames[targetProviderId];
  const fallbackClause = fallbackForProvider
    ? ` (fallback for ${targetDisplayName})`
    : "";

  return {
    angle: output.angle,
    fallbackForProvider,
    id: fallbackForProvider
      ? `draft-${provider.id}-fallback-${fallbackForProvider}`
      : `draft-${provider.id}`,
    modelProvenance: `${output.model}${fallbackClause}`,
    provider: provider.id,
    text: output.text,
    visibleRationale: output.visibleRationale,
  };
}

function buildProviderPrompt({
  angle,
  enrichmentContext,
  fallbackForProvider,
  replySignals,
  sourceTweet,
  usersDirection,
}: ProviderGenerationInput) {
  return JSON.stringify({
    task: "Produce one publishable English quote-tweet candidate under 280 characters.",
    requiredOutput: {
      angle: "short angle label",
      text: "publishable quote-tweet draft",
      visibleRationale: "one short sentence explaining the editorial read",
    },
    constraints: [
      "Use the source tweet as the visible anchor.",
      "Use reply signals and outside-X enrichment only as context.",
      "Explore the requested angle distinctly from the other providers.",
      "Respect the user's direction when it is relevant.",
      "Do not mention hidden enrichment, provider orchestration, or fallback in the draft text.",
    ],
    angle,
    fallbackForProvider,
    sourceTweet,
    replySignals,
    enrichmentContext,
    usersDirection,
  });
}

function buildLocalDraftText({
  angle,
  fallbackForProvider,
  usersDirection,
}: ProviderGenerationInput) {
  const normalizedDirection = usersDirection.trim();
  const directionClause = normalizedDirection
    ? ` Read it through this constraint: ${truncateAtWordBoundary(
        normalizedDirection,
        72,
      )}.`
    : "";
  const fallbackPrefix = fallbackForProvider
    ? "Quote-tweet draft: Fallback read:"
    : "Quote-tweet draft:";

  if (angle === "incentive shift") {
    return `${fallbackPrefix} useful tech news usually hides in incentives. This is not just a launch; it is pressure on every rival to explain why their workflow still feels bolted on.${directionClause}`;
  }

  if (angle === "distribution bet") {
    return `${fallbackPrefix} this looks like a feature, but it behaves like a distribution bet. Watch access, pricing, and who suddenly has to defend yesterday's roadmap.${directionClause}`;
  }

  if (angle === "operator pressure") {
    return `${fallbackPrefix} the product story is simple: less ceremony, more leverage. If operators adopt it, incumbents do not lose attention; they lose default status.${directionClause}`;
  }

  if (angle === "market timing") {
    return `${fallbackPrefix} timing is the signal. The winners are not just shipping faster; they are making every slower roadmap look like a tax on users.${directionClause}`;
  }

  if (angle === "roadmap pressure") {
    return `${fallbackPrefix} the move turns a product update into a roadmap audit. The question is not who has the feature, but who can make it feel inevitable.${directionClause}`;
  }

  return `${fallbackPrefix} the real story is not the launch, it is leverage. One product surface just became a pressure test for everyone trying to own the next interface.${directionClause}`;
}

function buildLocalVisibleRationale({
  angle,
  enrichmentContext,
  replySignals,
  usersDirection,
}: ProviderGenerationInput) {
  const contextParts = [
    replySignals.length > 0 ? "reply signals" : null,
    enrichmentContext && enrichmentContext.items.length > 0
      ? "hidden outside-X context"
      : null,
    usersDirection.trim() ? "Direction covered" : null,
  ].filter(Boolean);
  const contextClause =
    contextParts.length > 0 ? ` Uses ${contextParts.join(", ")}.` : "";

  return `Explores the ${angle} angle while keeping the source tweet as the anchor.${contextClause}`;
}

function buildRunLabel(sourceTweetUrl: string) {
  const statusId = sourceTweetUrl.match(/status\/([^/?#]+)/)?.[1] ?? "tweet";

  return `Drafts for ${statusId}`;
}

function stripJsonFences(value: string) {
  return value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");
}

function truncateAtWordBoundary(value: string, maxCharacters: number) {
  if (value.length <= maxCharacters) {
    return value;
  }

  const sliceLength = Math.max(1, maxCharacters - 3);
  const truncated = value.slice(0, sliceLength);
  const lastSpace = truncated.lastIndexOf(" ");

  return `${truncated.slice(0, lastSpace > 0 ? lastSpace : sliceLength)}...`;
}

function enforceAttentionLength(value: string) {
  return truncateAtWordBoundary(value, 280);
}

function readAiGatewayApiKey() {
  return (
    readEnvValue(process.env.AI_GATEWAY_API_KEY) ??
    readEnvValue(process.env.VERCEL_AI_GATEWAY_API_KEY)
  );
}
