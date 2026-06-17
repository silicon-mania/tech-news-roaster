import { z } from "zod";
import {
  type JokeContextSnapshot,
  parseVisualJokeDirectionText,
  parseVisualJokeSet,
  targetPerSection,
  type VisualJoke,
  type VisualJokeSection,
  type VisualJokeSet,
  type VisualJokeTopPick,
  visualJokeSectionSchema,
  visualJokeSections,
} from "@/services/generation";
import { fetchWithTimeout, readTimeoutMs } from "@/utils/fetch-with-timeout";
import { readConfiguredAiGatewayVisualJokeModel, readEnvValue } from "./ai-gateway-models";

const maximumTopPickCount = 3;
const maximumGatewayErrorLength = 500;
const defaultAiGatewayBaseUrl = "https://ai-gateway.vercel.sh/v1";
// A hung Visual Joke generation call is bounded by this timeout so it fails fast
// and degrades the run like any other Visual Joke failure today (the run still
// completes from the surviving branches). Tunable via
// AI_GATEWAY_VISUAL_JOKE_TIMEOUT_MS.
const defaultVisualJokeTimeoutMs = 60_000;
// Structured Outputs makes malformed candidate output rare, but a single
// unescaped character still fails JSON.parse for the whole batch at once. One
// repair-retry (a fresh sample) recovers the otherwise-good jokes; beyond that we
// surface the failure. 2 = the original attempt plus one retry.
const maximumCandidateGenerationAttempts = 2;

type VisualJokeModelEnvironment = Readonly<Record<string, string | undefined>>;

// The provider's categorized output (ADR 0017's provider-agnostic boundary): jokes
// grouped by section plus the model's self-flagged top picks, each with a one-line
// reason. The service — not the provider — assigns stable ids and within-section
// order and resolves top picks to those ids.
export type VisualJokeCandidateOutput = {
  jokes: Array<{ section: VisualJokeSection; text: string }>;
  topPicks: Array<{ reason: string; section: VisualJokeSection; text: string }>;
};

type VisualJokeCandidate = VisualJokeCandidateOutput["jokes"][number];
type VisualJokeTopPickCandidate = VisualJokeCandidateOutput["topPicks"][number];

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

const visualJokeProviderOutputSchema = z
  .object({
    jokes: z
      .array(
        z
          .object({
            section: visualJokeSectionSchema,
            text: z.string().trim().min(1),
          })
          .strict(),
      )
      .min(1),
    topPicks: z
      .array(
        z
          .object({
            reason: z.string().trim().min(1),
            section: visualJokeSectionSchema,
            text: z.string().trim().min(1),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();

// OpenAI Structured Outputs schema mirroring `visualJokeProviderOutputSchema`. The
// Vercel AI Gateway's chat/completions endpoint requires the `json_schema`
// response_format — plain `json_object` is rejected (400) for models like gpt-5.5.
// `additionalProperties: false` plus every key required keeps it strict-compatible;
// size constraints (minItems/maxItems) are intentionally omitted because they are
// not strict-mode keywords, and `visualJokeProviderOutputSchema` re-validates the
// shape after the parse anyway.
const visualJokeCandidatesJsonSchema = {
  additionalProperties: false,
  properties: {
    jokes: {
      items: {
        additionalProperties: false,
        properties: {
          section: { enum: [...visualJokeSections], type: "string" },
          text: { type: "string" },
        },
        required: ["section", "text"],
        type: "object",
      },
      type: "array",
    },
    topPicks: {
      items: {
        additionalProperties: false,
        properties: {
          reason: { type: "string" },
          section: { enum: [...visualJokeSections], type: "string" },
          text: { type: "string" },
        },
        required: ["reason", "section", "text"],
        type: "object",
      },
      type: "array",
    },
  },
  required: ["jokes", "topPicks"],
  type: "object",
};

export type VisualJokeServiceInput = {
  jokeContextSnapshot: JokeContextSnapshot;
  visualJokeDirection: string;
};

export type VisualJokeServiceResult = {
  visualJokeDirection: string;
  visualJokeSet: VisualJokeSet;
};

export type VisualJokeCandidateProvider = {
  model: string;
  provider: "ai-gateway" | "local" | "test";
  generateCandidates(input: {
    jokeContextSnapshot: JokeContextSnapshot;
    visualJokeDirection: string;
  }): Promise<VisualJokeCandidateOutput>;
};

// Carries a flat, human-readable `debugLog` for the Quiet Failure Details surface
// — mirroring the Image Generation failure path. The default message is identical
// whether the orchestrator or this service produced it, so the debugLog is what
// actually tells the two cases apart.
export class VisualJokeGenerationError extends Error {
  readonly debugLog?: string[];

  constructor(
    message = "Visual joke generation could not produce a publishable joke set.",
    options: { cause?: unknown; debugLog?: string[] } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "VisualJokeGenerationError";
    this.debugLog = options.debugLog;
  }
}

export async function generateVisualJokeSet(
  input: VisualJokeServiceInput,
  options: {
    now?: () => Date;
    provider?: VisualJokeCandidateProvider;
  } = {},
): Promise<VisualJokeServiceResult> {
  const visualJokeDirection = parseVisualJokeDirectionText(input.visualJokeDirection);
  const provider = options.provider ?? createDefaultVisualJokeCandidateProvider();
  const providerOutput = await provider.generateCandidates({
    jokeContextSnapshot: input.jokeContextSnapshot,
    visualJokeDirection,
  });
  const visualJokeSet = buildVisualJokeSet({
    now: options.now ?? (() => new Date()),
    providerLabel: `${provider.provider}/${provider.model}`,
    providerOutput,
  });

  return {
    visualJokeDirection,
    visualJokeSet,
  };
}

function createDefaultVisualJokeCandidateProvider(
  env: VisualJokeModelEnvironment = process.env,
): VisualJokeCandidateProvider {
  const model = readConfiguredAiGatewayVisualJokeModel(env);
  const apiKey = readAiGatewayApiKey(env);

  if (!apiKey && env.NODE_ENV !== "production") {
    return createLocalVisualJokeCandidateProvider(model);
  }

  return createAiGatewayVisualJokeCandidateProvider({
    apiKey,
    baseUrl: readEnvValue(env.AI_GATEWAY_BASE_URL),
    model,
    timeoutMs: readVisualJokeTimeoutMs(env),
  });
}

function createLocalVisualJokeCandidateProvider(
  model = readConfiguredAiGatewayVisualJokeModel(process.env),
): VisualJokeCandidateProvider {
  return {
    model,
    provider: "local",
    async generateCandidates({ jokeContextSnapshot }) {
      return buildLocalCandidateOutput(jokeContextSnapshot);
    },
  };
}

function createAiGatewayVisualJokeCandidateProvider({
  apiKey,
  baseUrl,
  model,
  timeoutMs,
}: {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string;
  timeoutMs: number;
}): VisualJokeCandidateProvider {
  return {
    model,
    provider: "ai-gateway",
    async generateCandidates({ jokeContextSnapshot, visualJokeDirection }) {
      if (!apiKey) {
        throw new VisualJokeGenerationError("AI Gateway credentials are not configured.", {
          debugLog: ["Step: generate-candidates", `Provider: ai-gateway/${model}`],
        });
      }

      const buildRequestBody = (useResponseFormat: boolean) =>
        JSON.stringify({
          messages: [
            {
              content:
                "You generate sharp, publishable visual-joke titles for tech-news commentary. Return only JSON.",
              role: "system",
            },
            {
              content: buildGatewayPrompt({
                jokeContextSnapshot,
                visualJokeDirection,
              }),
              role: "user",
            },
          ],
          model,
          // Structured Outputs: constrain decoding to schema-valid JSON so a stray
          // unescaped quote in a joke title can't break the parse for the whole batch.
          ...(useResponseFormat
            ? {
                response_format: {
                  json_schema: {
                    description: "A categorized set of publishable visual-joke candidates.",
                    name: "visual_joke_candidates",
                    schema: visualJokeCandidatesJsonSchema,
                    strict: true,
                  },
                  type: "json_schema",
                },
              }
            : {}),
          temperature: 0.9,
        });

      // Two independent, bounded fallbacks:
      //  - response_format negotiation (once): if the configured model rejects the
      //    parameter, drop it and rely on prompt-only JSON. This doesn't consume the
      //    parse-retry budget.
      //  - parse repair-retry: Structured Outputs makes malformed payloads rare, but
      //    when one slips through a fresh sample almost always parses cleanly.
      // Any other non-ok gateway response is a different failure and still fails fast.
      let useResponseFormat = true;
      let parseAttempts = 0;
      let lastParseError: unknown;

      while (parseAttempts < maximumCandidateGenerationAttempts) {
        const response = await fetchWithTimeout(
          `${(baseUrl ?? defaultAiGatewayBaseUrl).replace(/\/$/, "")}/chat/completions`,
          {
            body: buildRequestBody(useResponseFormat),
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            method: "POST",
            operationLabel: "Visual joke generation",
            timeoutMs,
            upstreamLabel: "the AI Gateway",
          },
        );

        if (!response.ok) {
          const gatewayError = await readGatewayError(response);

          if (
            useResponseFormat &&
            response.status === 400 &&
            gatewayError.includes("response_format")
          ) {
            useResponseFormat = false;
            continue;
          }

          throw new VisualJokeGenerationError(
            `Visual joke generation failed (${response.status}): ${gatewayError}`,
            {
              debugLog: [
                "Step: generate-candidates",
                `Provider: ai-gateway/${model}`,
                `Gateway status: ${response.status}`,
              ],
            },
          );
        }

        parseAttempts += 1;
        const payload = gatewayResponseSchema.parse(await response.json());

        try {
          return parseGatewayVisualJokeOutput(payload.choices[0].message.content);
        } catch (error) {
          lastParseError = error;
        }
      }

      throw new VisualJokeGenerationError(
        lastParseError instanceof Error
          ? lastParseError.message
          : "Visual joke output was not valid JSON.",
        {
          cause: lastParseError,
          debugLog: [
            "Step: generate-candidates",
            `Provider: ai-gateway/${model}`,
            `JSON parsing failed after ${maximumCandidateGenerationAttempts} attempts (structured outputs + one repair-retry).`,
          ],
        },
      );
    },
  };
}

// A pure step: map a raw gateway JSON string into the categorized provider output.
// Exported so it is exercisable directly without the network — it tolerates code
// fences and surrounding prose, then re-validates the shape via Zod.
export function parseGatewayVisualJokeOutput(content: string): VisualJokeCandidateOutput {
  const parsed = visualJokeProviderOutputSchema.parse(JSON.parse(extractJsonObject(content)));

  return {
    jokes: parsed.jokes.map((joke) => ({ section: joke.section, text: joke.text })),
    topPicks: parsed.topPicks.map((topPick) => ({
      reason: topPick.reason,
      section: topPick.section,
      text: topPick.text,
    })),
  };
}

function buildVisualJokeSet({
  now,
  providerLabel,
  providerOutput,
}: {
  now: () => Date;
  providerLabel: string;
  providerOutput: VisualJokeCandidateOutput;
}): VisualJokeSet {
  const jokes = assignSectionedJokes(providerOutput.jokes);

  if (jokes.length === 0) {
    throw new VisualJokeGenerationError(undefined, {
      debugLog: [
        "Step: assemble-visual-joke-set",
        `Provider: ${providerLabel}`,
        `Jokes returned: ${providerOutput.jokes.length}`,
        "No publishable visual jokes survived across the three sections.",
      ],
    });
  }

  return parseVisualJokeSet({
    generatedAt: now().toISOString(),
    id: "visual-joke-set-1",
    jokes,
    targetPerSection,
    topPicks: resolveTopPicks(providerOutput.topPicks, jokes),
  });
}

// Group the provider's jokes by section in direction order, drop blanks, cap each
// section at the target, and assign stable ids plus contiguous within-section order.
function assignSectionedJokes(candidates: VisualJokeCandidate[]): VisualJoke[] {
  const jokes: VisualJoke[] = [];

  for (const section of visualJokeSections) {
    const sectionCandidates = candidates
      .filter((candidate) => candidate.section === section)
      .map((candidate) => candidate.text.trim())
      .filter((text) => text.length > 0)
      .slice(0, targetPerSection);

    sectionCandidates.forEach((text, indexInSection) => {
      jokes.push({
        id: `visual-joke-${jokes.length + 1}`,
        order: indexInSection + 1,
        section,
        text,
      });
    });
  }

  return jokes;
}

// Resolve each Top Pick to the id of its matching joke (exact text within section).
// Unmatched picks are dropped rather than failing the set; if all drop, the first
// joke becomes the sole Top Pick so Automated Selection always has a target.
function resolveTopPicks(
  topPickCandidates: VisualJokeTopPickCandidate[],
  jokes: VisualJoke[],
): VisualJokeTopPick[] {
  const resolved: VisualJokeTopPick[] = [];
  const usedJokeIds = new Set<string>();

  for (const topPick of topPickCandidates) {
    if (resolved.length === maximumTopPickCount) {
      break;
    }

    const match = jokes.find(
      (joke) =>
        joke.section === topPick.section &&
        joke.text === topPick.text.trim() &&
        !usedJokeIds.has(joke.id),
    );

    if (!match) {
      continue;
    }

    resolved.push({ reason: topPick.reason.trim(), visualJokeId: match.id });
    usedJokeIds.add(match.id);
  }

  if (resolved.length > 0) {
    return resolved;
  }

  return [
    {
      reason: "Default Top Pick — no model Top Pick matched a returned joke.",
      visualJokeId: jokes[0].id,
    },
  ];
}

// A realistic offline 3-section set (~7 per section) plus Top Picks so the workflow
// runs without live API calls. The jokes lean on the snapshot's named actor and
// strongest details so the local-dev path resembles a real categorized result.
function buildLocalCandidateOutput(
  jokeContextSnapshot: JokeContextSnapshot,
): VisualJokeCandidateOutput {
  const namedActor = extractNamedNewsActors(jokeContextSnapshot)[0] ?? "The launch";

  const satire = [
    `${namedActor} Ships The Pricing Shortcut`,
    `${namedActor} Premium Coordination Cloud`,
    "Workflow Lock-In With Better Lighting",
    "Every Launch Is A Billing Event",
    "The Moat Is The Workflow",
    "Breaking: The Dashboard Needs A Manager",
    `${namedActor} Wants Rent On Your Entire Workflow`,
  ];

  const techPositive = [
    `Everyone Who Doubted ${namedActor} Now Quietly Depends On It`,
    "Analysts Who Called It A Toy Update Their Price Targets",
    "The Haters Discover The Roadmap Was Real",
    "Wall Street Reluctantly Learns The Demo Shipped",
    "Critics Demand Refund On Their Skepticism",
    "The Workflow They Mocked Becomes The Default",
    "Press Corrects Itself, Slowly, In Smaller Font",
  ];

  const experimental = [
    "2037: the bottleneck files for emancipation",
    "A spinner, narrating its own launch",
    "Two words: workflow finally",
    "Correction: the product was the friends we automated along the way",
    "Object permanence, but for your unsaved changes",
    "The login screen writes a memoir",
    "Headline redacted by its own roadmap",
  ];

  const jokes: VisualJokeCandidate[] = [
    ...satire.map((text) => ({ section: "satire" as const, text })),
    ...techPositive.map((text) => ({ section: "tech-positive" as const, text })),
    ...experimental.map((text) => ({ section: "experimental" as const, text })),
  ];

  const topPicks: VisualJokeTopPickCandidate[] = [
    {
      reason: "Sharpest satire angle — names the actor and the incentive in one line.",
      section: "satire",
      text: satire[0],
    },
    {
      reason: "Cleanest tech-positive flip — defends the subject while staying funny.",
      section: "tech-positive",
      text: techPositive[0],
    },
    {
      reason: "Strongest experiment — a time jump that still lands.",
      section: "experimental",
      text: experimental[0],
    },
  ];

  return { jokes, topPicks };
}

function buildGatewayPrompt({
  jokeContextSnapshot,
  visualJokeDirection,
}: {
  jokeContextSnapshot: JokeContextSnapshot;
  visualJokeDirection: string;
}) {
  return JSON.stringify({
    task: "Return a categorized set of visual-joke titles: up to seven per section across satire, tech-positive, and experimental, plus your two-to-three top picks.",
    requiredOutput: {
      jokes: [
        {
          section: visualJokeSections,
          text: "a visual-joke title",
        },
      ],
      topPicks: [
        {
          reason: "one short reason this is a top pick",
          section: visualJokeSections,
          text: "the exact title of one returned joke",
        },
      ],
    },
    constraints: [
      "Use the Joke Context Snapshot and the Visual Joke Direction only.",
      "Do not ask for or rely on User's Direction.",
      "Do not ask for or rely on any User Image Prompt.",
      "Each top pick's text must exactly match one returned joke in the same section.",
    ],
    jokeContextSnapshot,
    visualJokeDirection,
  });
}

function extractNamedNewsActors(jokeContextSnapshot: JokeContextSnapshot) {
  const actorMatches = [
    jokeContextSnapshot.structuredContext.sourceTweetClaim,
    ...jokeContextSnapshot.structuredContext.supportingFacts,
  ]
    .flatMap((value) =>
      [...value.matchAll(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+)*)\b/g)].map(
        (match) => match[1],
      ),
    )
    .filter((value) => !["Source", "The"].includes(value));

  return Array.from(new Set(actorMatches)).slice(0, 3);
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
    return (await response.text()).slice(0, maximumGatewayErrorLength) || "No error body returned.";
  } catch {
    return "No error body returned.";
  }
}

function readAiGatewayApiKey(env: VisualJokeModelEnvironment) {
  return readEnvValue(env.AI_GATEWAY_API_KEY) ?? readEnvValue(env.VERCEL_AI_GATEWAY_API_KEY);
}

function readVisualJokeTimeoutMs(env: VisualJokeModelEnvironment) {
  return readTimeoutMs(env.AI_GATEWAY_VISUAL_JOKE_TIMEOUT_MS, defaultVisualJokeTimeoutMs);
}
