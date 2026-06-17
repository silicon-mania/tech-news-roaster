import { z } from "zod";
import {
  type CompletedGenerationRunPayload,
  defaultVisualJokeDirection,
  draftTarget,
  type GenerationProviderId,
  type GenerationResultStates,
  generationProviderIds,
  type JokeContextSnapshot,
  parseCompletedGenerationRunPayload,
  type QuoteTweetDraft,
} from "@/services/generation";
import type { RetrievedSourceTweet } from "@/services/tweet-retrieval";
import { fetchWithTimeout, readTimeoutMs } from "@/utils/fetch-with-timeout";
import { readConfiguredAiGatewayModels, readEnvValue } from "./ai-gateway-models";
import { describeErrorDetail, summarizeErrorMessage } from "./error-detail";
import {
  generateVisualJokeSet,
  type VisualJokeCandidateProvider,
  VisualJokeGenerationError,
  type VisualJokeServiceResult,
} from "./visual-joke-service";

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
  fallbackForProvider?: GenerationProviderId;
  jokeContextSnapshot: JokeContextSnapshot;
  sourceTweet: RetrievedSourceTweet;
  targetProviderId: GenerationProviderId;
  usersDirection: string;
};

export type GenerationOrchestratorInput = {
  jokeContextSnapshot: JokeContextSnapshot;
  sourceTweet: RetrievedSourceTweet;
  sourceTweetUrl: string;
  usersDirection: string;
};

export type GenerationOrchestrator = (
  input: GenerationOrchestratorInput,
) => Promise<CompletedGenerationRunPayload>;

type GenerationOrchestratorOptions = {
  now?: () => Date;
  providers?: GenerationProvider[];
  visualJokeProvider?: VisualJokeCandidateProvider;
};

// Each Text Generation provider call (and the Provider Fallback call, which
// reuses the same provider) is bounded by this timeout so one hung provider
// fails fast and is treated as a failed provider — Provider Fallback still
// produces a complete three-draft set. Tunable via AI_GATEWAY_TEXT_TIMEOUT_MS.
const defaultTextGenerationTimeoutMs = 60_000;

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
    angle: z.string().min(1).optional(),
    draft: z.string().min(1).optional(),
    rationale: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    tweet: z.string().min(1).optional(),
    visible_rationale: z.string().min(1).optional(),
    visibleRationale: z.string().min(1).optional(),
  })
  .passthrough();

const providerDisplayNames: Record<GenerationProviderId, GenerationProvider["displayName"]> = {
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
  const now = options.now ?? (() => new Date());
  const textGenerationStartedAt = now().toISOString();
  const visualJokeGenerationStartedAt = now().toISOString();
  const textGenerationPromise = generateDrafts(input, options.providers);
  const visualJokePromise = generateVisualJokeSet(
    {
      jokeContextSnapshot: input.jokeContextSnapshot,
      visualJokeDirection: defaultVisualJokeDirection,
    },
    {
      now,
      provider: options.visualJokeProvider,
    },
  );
  const [textGenerationResult, visualJokeResult] = await Promise.all([
    textGenerationPromise
      .then((result) => ({ result, status: "fulfilled" as const }))
      .catch((error: unknown) => ({ error, status: "rejected" as const })),
    visualJokePromise
      .then((result) => ({ result, status: "fulfilled" as const }))
      .catch((error: unknown) => ({ error, status: "rejected" as const })),
  ]);

  if (textGenerationResult.status === "rejected" && visualJokeResult.status === "rejected") {
    throw textGenerationResult.error;
  }

  const label = buildRunLabel(input.sourceTweetUrl);
  const drafts =
    textGenerationResult.status === "fulfilled" ? textGenerationResult.result.drafts : [];
  const fallbackDisclosure =
    textGenerationResult.status === "fulfilled"
      ? textGenerationResult.result.fallbackDisclosure
      : undefined;
  const generationResultStates = buildCreativeResultStates({
    input,
    now,
    textGenerationResult,
    textGenerationStartedAt,
    visualJokeGenerationStartedAt,
    visualJokeResult,
  });

  return parseCompletedGenerationRunPayload({
    drafts,
    fallbackDisclosure,
    generationResultStates,
    label,
    sourceTweet: input.sourceTweet,
    visualJokeDirection:
      visualJokeResult.status === "fulfilled"
        ? visualJokeResult.result.visualJokeDirection
        : defaultVisualJokeDirection,
    visualJokeSet:
      visualJokeResult.status === "fulfilled" ? visualJokeResult.result.visualJokeSet : undefined,
  });
}

async function generateDrafts(
  input: GenerationOrchestratorInput,
  providerOptions?: GenerationProvider[],
) {
  const providers = providerOptions ?? createDefaultGenerationProviders();
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));
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
    console.warn(
      `${providerDisplayNames[providerId]} generation failed before fallback.`,
      result.reason,
    );
  });

  for (const [index, failedProviderId] of failedProviderIds.entries()) {
    const fallbackProvider = successfulProviders.at(index % successfulProviders.length);

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

  return {
    drafts,
    fallbackDisclosure,
  };
}

function buildCreativeResultStates({
  input,
  now,
  textGenerationResult,
  textGenerationStartedAt,
  visualJokeGenerationStartedAt,
  visualJokeResult,
}: {
  input: GenerationOrchestratorInput;
  now: () => Date;
  textGenerationResult:
    | {
        result: Awaited<ReturnType<typeof generateDrafts>>;
        status: "fulfilled";
      }
    | {
        error: unknown;
        status: "rejected";
      };
  textGenerationStartedAt: string;
  visualJokeGenerationStartedAt: string;
  visualJokeResult:
    | {
        result: VisualJokeServiceResult;
        status: "fulfilled";
      }
    | {
        error: unknown;
        status: "rejected";
      };
}): GenerationResultStates {
  const completedAt = now().toISOString();

  return {
    contextGathering: {
      completedAt,
      jokeContextSnapshot: input.jokeContextSnapshot,
      startedAt: completedAt,
      status: "completed",
    },
    imageGeneration: {
      status: "not-started",
    },
    newsLinkedImageDiscovery: {
      status: "not-started",
    },
    textGeneration:
      textGenerationResult.status === "fulfilled"
        ? {
            completedAt,
            draftCount: draftTarget,
            startedAt: textGenerationStartedAt,
            status: "completed",
          }
        : {
            failedAt: completedAt,
            message: "Text generation could not produce a usable draft set.",
            startedAt: textGenerationStartedAt,
            status: "failed",
          },
    visualJokeGeneration:
      visualJokeResult.status === "fulfilled"
        ? {
            completedAt,
            startedAt: visualJokeGenerationStartedAt,
            status: "completed",
            visualJokeSet: visualJokeResult.result.visualJokeSet,
          }
        : buildVisualJokeFailureState({
            error: visualJokeResult.error,
            failedAt: completedAt,
            startedAt: visualJokeGenerationStartedAt,
          }),
  };
}

// Surfaces the real Visual Joke failure on the Quiet Failure Details surface,
// mirroring the Image Generation failure path: the summarized error becomes the
// message, and the flat error/cause chain plus any domain debugLog (e.g. the
// critic's rejection breakdown) become the numbered debug lines. Without this the
// failure collapses to one generic, undiagnosable line.
function buildVisualJokeFailureState({
  error,
  failedAt,
  startedAt,
}: {
  error: unknown;
  failedAt: string;
  startedAt: string;
}): Extract<GenerationResultStates["visualJokeGeneration"], { status: "failed" }> {
  const debugLog = [
    ...describeErrorDetail(error),
    ...(error instanceof VisualJokeGenerationError && error.debugLog ? error.debugLog : []),
  ];
  const message = summarizeErrorMessage(
    error,
    "Visual joke generation could not produce a publishable joke set.",
  );

  console.error("[visual-joke] generation failed", { debugLog, message });

  return {
    debugLog: debugLog.length > 0 ? debugLog : undefined,
    failedAt,
    message,
    startedAt,
    status: "failed",
  };
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

      const gatewayBaseUrl = process.env.AI_GATEWAY_BASE_URL ?? "https://ai-gateway.vercel.sh/v1";
      const response = await fetchWithTimeout(
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
            temperature: 0.8,
          }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          operationLabel: `${displayName} generation`,
          timeoutMs: readTextGenerationTimeoutMs(),
          upstreamLabel: "the AI Gateway",
        },
      );

      if (!response.ok) {
        throw new Error(
          `${displayName} generation failed (${response.status}): ${await readGatewayError(
            response,
          )}`,
        );
      }

      const payload = gatewayResponseSchema.parse(await response.json());
      const parsedOutput = parseProviderJsonOutput(payload.choices[0].message.content, input.angle);

      return {
        ...parsedOutput,
        model,
        text: enforceAttentionLength(parsedOutput.text),
      };
    },
  };
}

function parseProviderJsonOutput(content: string, fallbackAngle: string) {
  const output = providerJsonOutputSchema.parse(JSON.parse(extractJsonObject(content)));
  const text = output.text ?? output.draft ?? output.tweet;
  const visibleRationale = output.visibleRationale ?? output.visible_rationale ?? output.rationale;

  if (!text) {
    throw new Error("Gateway response did not include draft text.");
  }

  return {
    angle: output.angle ?? fallbackAngle,
    text,
    visibleRationale:
      visibleRationale ??
      `Explores the ${output.angle ?? fallbackAngle} angle from the retrieved context.`,
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
  const fallbackClause = fallbackForProvider ? ` (fallback for ${targetDisplayName})` : "";

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
  fallbackForProvider,
  jokeContextSnapshot,
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
      "Use the Joke Context Snapshot only as hidden editorial grounding.",
      "Explore the requested angle distinctly from the other providers.",
      "Respect the user's direction when it is relevant.",
      "Keep the user's direction scoped to text generation only.",
      "Do not mention provider orchestration or fallback in the draft text.",
    ],
    angle,
    fallbackForProvider,
    jokeContextSnapshot,
    sourceTweet,
    usersDirection,
  });
}

function buildLocalDraftText({
  angle,
  fallbackForProvider,
  jokeContextSnapshot,
  usersDirection,
}: ProviderGenerationInput) {
  const normalizedDirection = usersDirection.trim();
  const directionClause = normalizedDirection
    ? ` Read it through this constraint: ${truncateAtWordBoundary(normalizedDirection, 72)}.`
    : "";
  const tensionClause = ` Ground it in this tension: ${truncateAtWordBoundary(
    jokeContextSnapshot.structuredContext.jokeableTensions[0] ??
      jokeContextSnapshot.structuredContext.sourceTweetClaim,
    72,
  )}.`;
  const fallbackPrefix = fallbackForProvider
    ? "Quote-tweet draft: Fallback read:"
    : "Quote-tweet draft:";

  if (angle === "incentive shift") {
    return `${fallbackPrefix} useful tech news usually hides in incentives. This is not just a launch; it is pressure on every rival to explain why their workflow still feels bolted on.${tensionClause}${directionClause}`;
  }

  if (angle === "distribution bet") {
    return `${fallbackPrefix} this looks like a feature, but it behaves like a distribution bet. Watch access, pricing, and who suddenly has to defend yesterday's roadmap.${tensionClause}${directionClause}`;
  }

  if (angle === "operator pressure") {
    return `${fallbackPrefix} the product story is simple: less ceremony, more leverage. If operators adopt it, incumbents do not lose attention; they lose default status.${tensionClause}${directionClause}`;
  }

  if (angle === "market timing") {
    return `${fallbackPrefix} timing is the signal. The winners are not just shipping faster; they are making every slower roadmap look like a tax on users.${tensionClause}${directionClause}`;
  }

  if (angle === "roadmap pressure") {
    return `${fallbackPrefix} the move turns a product update into a roadmap audit. The question is not who has the feature, but who can make it feel inevitable.${tensionClause}${directionClause}`;
  }

  return `${fallbackPrefix} the real story is not the launch, it is leverage. One product surface just became a pressure test for everyone trying to own the next interface.${tensionClause}${directionClause}`;
}

function buildLocalVisibleRationale({
  angle,
  jokeContextSnapshot,
  usersDirection,
}: ProviderGenerationInput) {
  const contextParts = [
    jokeContextSnapshot.structuredContext.replySignals.representativeSnippets.length > 0
      ? "snapshot grounding"
      : null,
    usersDirection.trim() ? "Direction covered" : null,
  ].filter(Boolean);
  const contextClause = contextParts.length > 0 ? ` Uses ${contextParts.join(", ")}.` : "";

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

function extractJsonObject(value: string) {
  const strippedValue = stripJsonFences(value);
  const objectStart = strippedValue.indexOf("{");
  const objectEnd = strippedValue.lastIndexOf("}");

  if (objectStart === -1 || objectEnd === -1 || objectEnd < objectStart) {
    return strippedValue;
  }

  return strippedValue.slice(objectStart, objectEnd + 1);
}

async function readGatewayError(response: Response) {
  try {
    return truncateAtWordBoundary(await response.text(), 500);
  } catch {
    return "No error body returned.";
  }
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

function readTextGenerationTimeoutMs() {
  return readTimeoutMs(process.env.AI_GATEWAY_TEXT_TIMEOUT_MS, defaultTextGenerationTimeoutMs);
}
