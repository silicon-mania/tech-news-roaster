import { z } from "zod";
import {
  type JokeContextSnapshot,
  parseVisualJokeDirectionText,
  parseVisualJokeSet,
  type VisualJoke,
  type VisualJokeMetadata,
  type VisualJokeSet,
} from "@/services/generation";
import { fetchWithTimeout, readTimeoutMs } from "@/utils/fetch-with-timeout";
import { readConfiguredAiGatewayVisualJokeModel, readEnvValue } from "./ai-gateway-models";

const minimumReturnedJokeCount = 5;
const targetReturnedJokeCount = 8;
const maximumTitleWordCount = 12;
const maximumGatewayErrorLength = 500;
const defaultAiGatewayBaseUrl = "https://ai-gateway.vercel.sh/v1";
// A hung Visual Joke generation call is bounded by this timeout so it fails fast
// and degrades the run like any other Visual Joke failure today (the run still
// completes from the surviving branches). Tunable via
// AI_GATEWAY_VISUAL_JOKE_TIMEOUT_MS.
const defaultVisualJokeTimeoutMs = 60_000;

const visualJokePatterns = [
  "truthful misdirection",
  "dark tech satire",
  "tech-native metaphor",
  "fake product naming",
  "deadpan diagnosis",
  "incentive roast",
  "absurd headline",
  "earned edge",
] as const;

type VisualJokePattern = (typeof visualJokePatterns)[number];

type VisualJokeModelEnvironment = Readonly<Record<string, string | undefined>>;

type RoughVisualJokeCandidate = {
  metadata: VisualJokeMetadata;
  text: string;
};

type EvaluatedCandidate = RoughVisualJokeCandidate & {
  pattern: VisualJokePattern;
  score: number;
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

const visualJokeCandidateSchema = z
  .object({
    jokePattern: z.enum(visualJokePatterns),
    jokeTarget: z.string().trim().min(1),
    referencedFact: z.string().trim().min(1),
    shortRationale: z.string().trim().min(1),
    text: z.string().trim().min(1),
  })
  .strict();

const visualJokeProviderOutputSchema = z
  .object({
    candidates: z.array(visualJokeCandidateSchema).min(minimumReturnedJokeCount),
  })
  .strict();

export const defaultVisualJokeDirection = parseVisualJokeDirectionText(`
Write short visual-joke titles for tech-news quote-tweet images.
Favor dark, sharp tech satire that targets systems, incentives, product dynamics, platform power, company behavior, market logic, and hype cycles.
Use the Joke Context Snapshot as hidden grounding.
Return only publishable candidates that feel like title-length insider punchlines.
If a public person is mentioned, use their name in the joke title.
Prefer truthful misdirection, tech-native metaphor, deadpan diagnosis, incentive roast, fake product naming, absurd headline, and earned edge when the context supports it.
Avoid boring accuracy, unsupported claims, condescension, cheap profanity, and anything that reads like a visible rationale instead of a joke.
Keep joke titles readable at scroll speed and usually between eight and twelve words.
`);

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
    targetCount: number;
    visualJokeDirection: string;
  }): Promise<RoughVisualJokeCandidate[]>;
};

class VisualJokeGenerationError extends Error {
  constructor(message = "Visual joke generation could not produce a publishable joke set.") {
    super(message);
    this.name = "VisualJokeGenerationError";
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
  const roughCandidates = await provider.generateCandidates({
    jokeContextSnapshot: input.jokeContextSnapshot,
    targetCount: targetReturnedJokeCount,
    visualJokeDirection,
  });
  const visualJokeSet = buildVisualJokeSet({
    jokeContextSnapshot: input.jokeContextSnapshot,
    now: options.now ?? (() => new Date()),
    roughCandidates,
    targetCount: targetReturnedJokeCount,
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
      return buildLocalCandidates(jokeContextSnapshot);
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
    async generateCandidates({ jokeContextSnapshot, targetCount, visualJokeDirection }) {
      if (!apiKey) {
        throw new VisualJokeGenerationError("AI Gateway credentials are not configured.");
      }

      const response = await fetchWithTimeout(
        `${(baseUrl ?? defaultAiGatewayBaseUrl).replace(/\/$/, "")}/chat/completions`,
        {
          body: JSON.stringify({
            messages: [
              {
                content:
                  "You generate sharp, publishable visual-joke titles for tech-news commentary. Return only JSON.",
                role: "system",
              },
              {
                content: buildGatewayPrompt({
                  jokeContextSnapshot,
                  targetCount,
                  visualJokeDirection,
                }),
                role: "user",
              },
            ],
            model,
            temperature: 0.9,
          }),
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
        throw new VisualJokeGenerationError(
          `Visual joke generation failed (${response.status}): ${await readGatewayError(response)}`,
        );
      }

      const payload = gatewayResponseSchema.parse(await response.json());
      const parsedOutput = visualJokeProviderOutputSchema.parse(
        JSON.parse(extractJsonObject(payload.choices[0].message.content)),
      );

      return parsedOutput.candidates.map((candidate) => ({
        metadata: {
          jokePattern: candidate.jokePattern,
          jokeTarget: candidate.jokeTarget,
          referencedFact: candidate.referencedFact,
          shortRationale: candidate.shortRationale,
        },
        text: candidate.text,
      }));
    },
  };
}

function buildVisualJokeSet({
  jokeContextSnapshot,
  now,
  roughCandidates,
  targetCount,
}: {
  jokeContextSnapshot: JokeContextSnapshot;
  now: () => Date;
  roughCandidates: RoughVisualJokeCandidate[];
  targetCount: number;
}) {
  const evaluatedCandidates = roughCandidates
    .map((candidate) => evaluateCandidate(candidate, jokeContextSnapshot))
    .filter((candidate): candidate is EvaluatedCandidate => candidate !== null);
  const selectedCandidates = selectDiverseCandidates({
    evaluatedCandidates,
    jokeContextSnapshot,
    targetCount,
  });

  if (selectedCandidates.length < minimumReturnedJokeCount) {
    throw new VisualJokeGenerationError();
  }

  return parseVisualJokeSet({
    generatedAt: now().toISOString(),
    id: "visual-joke-set-1",
    jokes: selectedCandidates.map((candidate, index) => buildVisualJoke(candidate, index)),
    targetCount,
  });
}

function buildVisualJoke(candidate: EvaluatedCandidate, index: number): VisualJoke {
  return {
    id: `visual-joke-${index + 1}`,
    metadata: candidate.metadata,
    rank: index + 1,
    recommended: index === 0,
    text: candidate.text.trim(),
  };
}

function selectDiverseCandidates({
  evaluatedCandidates,
  jokeContextSnapshot,
  targetCount,
}: {
  evaluatedCandidates: EvaluatedCandidate[];
  jokeContextSnapshot: JokeContextSnapshot;
  targetCount: number;
}) {
  const candidatesByPattern = new Map<VisualJokePattern, EvaluatedCandidate[]>();

  for (const pattern of visualJokePatterns) {
    candidatesByPattern.set(
      pattern,
      evaluatedCandidates
        .filter((candidate) => candidate.pattern === pattern)
        .sort((left, right) => right.score - left.score),
    );
  }

  const selected: EvaluatedCandidate[] = [];
  const usedTexts = new Set<string>();

  for (const pattern of visualJokePatterns) {
    const candidate = candidatesByPattern
      .get(pattern)
      ?.find((entry) => !usedTexts.has(normalizeForComparison(entry.text)));

    if (!candidate) {
      continue;
    }

    selected.push(candidate);
    usedTexts.add(normalizeForComparison(candidate.text));

    if (selected.length === targetCount) {
      break;
    }
  }

  const remainingCandidates = evaluatedCandidates
    .filter((candidate) => !usedTexts.has(normalizeForComparison(candidate.text)))
    .sort((left, right) => right.score - left.score);

  for (const candidate of remainingCandidates) {
    if (selected.length === targetCount) {
      break;
    }

    selected.push(candidate);
    usedTexts.add(normalizeForComparison(candidate.text));
  }

  const needsBoldCandidate =
    contextSupportsBoldCandidate(jokeContextSnapshot) &&
    !selected.some((candidate) => candidate.pattern === "earned edge");

  if (needsBoldCandidate) {
    const earnedEdgeCandidate = candidatesByPattern.get("earned edge")?.[0];

    if (earnedEdgeCandidate) {
      const replacementIndex = selected.findLastIndex(
        (candidate) => candidate.pattern !== "earned edge",
      );

      if (replacementIndex >= 0) {
        selected.splice(replacementIndex, 1, earnedEdgeCandidate);
      } else if (selected.length < targetCount) {
        selected.push(earnedEdgeCandidate);
      }
    }
  }

  return selected.sort((left, right) => right.score - left.score).slice(0, targetCount);
}

function evaluateCandidate(
  candidate: RoughVisualJokeCandidate,
  jokeContextSnapshot: JokeContextSnapshot,
) {
  const normalizedText = collapseWhitespace(candidate.text);
  const pattern = normalizePattern(candidate.metadata.jokePattern);

  if (!pattern) {
    return null;
  }

  if (countWords(normalizedText) > maximumTitleWordCount || countWords(normalizedText) < 3) {
    return null;
  }

  if (looksCondescending(normalizedText, candidate.metadata.jokeTarget)) {
    return null;
  }

  if (containsCheapProfanity(normalizedText)) {
    return null;
  }

  if (looksLikeBoringAccuracy(normalizedText, jokeContextSnapshot)) {
    return null;
  }

  if (
    !isReferenceSupported(candidate.metadata.referencedFact, jokeContextSnapshot) ||
    violatesForbiddenAssumptions(normalizedText, jokeContextSnapshot)
  ) {
    return null;
  }

  const namedActorCount = extractNamedNewsActors(jokeContextSnapshot).filter((actor) =>
    normalizeForComparison(normalizedText).includes(normalizeForComparison(actor)),
  ).length;
  const tensionOverlap = buildContextTerms(jokeContextSnapshot).filter((term) =>
    normalizeForComparison(normalizedText).includes(term),
  ).length;
  const score =
    100 -
    countWords(normalizedText) +
    patternScore(pattern) +
    namedActorCount * 6 +
    tensionOverlap * 2;

  return {
    metadata: candidate.metadata,
    pattern,
    score,
    text: normalizedText,
  } satisfies EvaluatedCandidate;
}

function buildLocalCandidates(
  jokeContextSnapshot: JokeContextSnapshot,
): RoughVisualJokeCandidate[] {
  const namedActor = extractNamedNewsActors(jokeContextSnapshot)[0] ?? "The launch";
  const strongestFact =
    jokeContextSnapshot.structuredContext.supportingFacts[0] ??
    jokeContextSnapshot.structuredContext.sourceTweetClaim;
  const strongestTension =
    jokeContextSnapshot.structuredContext.jokeableTensions[0] ??
    jokeContextSnapshot.structuredContext.sourceTweetClaim;
  const mediaDetail =
    jokeContextSnapshot.structuredContext.sourceTweetMediaExtraction.notableDetails[0] ??
    jokeContextSnapshot.structuredContext.sourceTweetMediaExtraction.summary;
  const jokeTarget = determineJokeTarget(jokeContextSnapshot);
  const candidates: RoughVisualJokeCandidate[] = [
    {
      metadata: {
        jokePattern: "truthful misdirection",
        jokeTarget,
        referencedFact: strongestFact,
        shortRationale: "Frames the public launch as a disguised pricing or power move.",
      },
      text: `${namedActor} Ships The Pricing Shortcut`,
    },
    {
      metadata: {
        jokePattern: "dark tech satire",
        jokeTarget,
        referencedFact: strongestTension,
        shortRationale: "Turns the workflow promise into a cynical systems read.",
      },
      text: "Workflow Lock-In With Better Lighting",
    },
    {
      metadata: {
        jokePattern: "tech-native metaphor",
        jokeTarget,
        referencedFact: strongestTension,
        shortRationale: "Maps the launch onto a familiar technical abstraction.",
      },
      text: "Roadmap As A Service",
    },
    {
      metadata: {
        jokePattern: "fake product naming",
        jokeTarget,
        referencedFact: mediaDetail,
        shortRationale: "Names the incentive structure like a product SKU.",
      },
      text: `${namedActor} Premium Coordination Cloud`,
    },
    {
      metadata: {
        jokePattern: "deadpan diagnosis",
        jokeTarget,
        referencedFact: strongestTension,
        shortRationale: "States the incentive problem as a dry diagnosis.",
      },
      text: "The Moat Is The Workflow",
    },
    {
      metadata: {
        jokePattern: "incentive roast",
        jokeTarget,
        referencedFact: strongestFact,
        shortRationale: "Roasts the incentive structure without losing factual support.",
      },
      text: "Every Launch Is A Billing Event",
    },
    {
      metadata: {
        jokePattern: "absurd headline",
        jokeTarget,
        referencedFact: mediaDetail,
        shortRationale: "Pushes the announcement into absurd but legible headline territory.",
      },
      text: "Breaking: The Dashboard Needs A Manager",
    },
    {
      metadata: {
        jokePattern: "earned edge",
        jokeTarget,
        referencedFact: strongestTension,
        shortRationale: "Lets the sharpest candidate push harder because the context supports it.",
      },
      text: `${namedActor} Wants Rent On Your Entire Workflow`,
    },
    {
      metadata: {
        jokePattern: "truthful misdirection",
        jokeTarget,
        referencedFact: strongestFact,
        shortRationale: "This is a deliberate boring-accuracy decoy for the critic.",
      },
      text: `${namedActor} Launches Agent Workspace`,
    },
  ];

  return candidates;
}

function buildGatewayPrompt({
  jokeContextSnapshot,
  targetCount,
  visualJokeDirection,
}: {
  jokeContextSnapshot: JokeContextSnapshot;
  targetCount: number;
  visualJokeDirection: string;
}) {
  return JSON.stringify({
    task: "Return rough visual-joke candidates that a local critic can rank into a final publishable set.",
    requiredOutput: {
      candidates: [
        {
          jokePattern: visualJokePatterns,
          jokeTarget:
            "system, incentive, product dynamic, company behavior, platform power, or market logic",
          referencedFact:
            "an exact context-supported fact or tension copied from the Joke Context Snapshot",
          shortRationale: "one short internal rationale",
          text: "three-to-twelve-word visual-joke title",
        },
      ],
    },
    constraints: [
      "Use the Joke Context Snapshot and the Visual Joke Direction only.",
      "Do not ask for or rely on User's Direction.",
      "Do not ask for or rely on any User Image Prompt.",
      "Return more than the final target so the critic can reject weaker options.",
      "Avoid boring accuracy, unsupported claims, condescending jokes, and cheap profanity.",
      "Use named actors when the context clearly supports them.",
      "Include at least one earned-edge candidate when the context supports it.",
    ],
    targetCount,
    jokeContextSnapshot,
    visualJokeDirection,
  });
}

function determineJokeTarget(jokeContextSnapshot: JokeContextSnapshot) {
  const replySummary = jokeContextSnapshot.structuredContext.replySignals.summary.toLowerCase();
  const sourceClaim = jokeContextSnapshot.structuredContext.sourceTweetClaim.toLowerCase();

  if (replySummary.includes("pricing") || sourceClaim.includes("pricing")) {
    return "platform pricing logic";
  }

  if (replySummary.includes("lock-in") || sourceClaim.includes("workflow")) {
    return "workflow lock-in economics";
  }

  return "platform leverage";
}

function normalizePattern(value: string): VisualJokePattern | null {
  const normalizedValue = collapseWhitespace(value).toLowerCase();

  return visualJokePatterns.find((pattern) => pattern === normalizedValue) ?? null;
}

function patternScore(pattern: VisualJokePattern) {
  switch (pattern) {
    case "truthful misdirection":
      return 18;
    case "earned edge":
      return 17;
    case "incentive roast":
      return 16;
    case "tech-native metaphor":
      return 15;
    case "dark tech satire":
      return 14;
    case "fake product naming":
      return 13;
    case "deadpan diagnosis":
      return 12;
    case "absurd headline":
      return 11;
  }
}

function looksLikeBoringAccuracy(text: string, jokeContextSnapshot: JokeContextSnapshot) {
  const candidateTerms = normalizeForComparison(text).split(" ").filter(Boolean);
  const sourceTweetTerms = normalizeForComparison(
    jokeContextSnapshot.structuredContext.sourceTweetClaim,
  )
    .split(" ")
    .filter(Boolean);
  const overlapCount = candidateTerms.filter((term) => sourceTweetTerms.includes(term)).length;

  return overlapCount >= Math.max(3, Math.ceil(candidateTerms.length * 0.7));
}

function isReferenceSupported(referencedFact: string, jokeContextSnapshot: JokeContextSnapshot) {
  const normalizedReference = normalizeForComparison(referencedFact);
  const supportedFacts = [
    jokeContextSnapshot.structuredContext.sourceTweetClaim,
    jokeContextSnapshot.structuredContext.sourceTweetMediaExtraction.summary,
    ...jokeContextSnapshot.structuredContext.sourceTweetMediaExtraction.notableDetails,
    jokeContextSnapshot.structuredContext.replySignals.summary,
    ...jokeContextSnapshot.structuredContext.supportingFacts,
    ...jokeContextSnapshot.structuredContext.jokeableTensions,
  ].map(normalizeForComparison);

  return supportedFacts.some(
    (fact) => fact.includes(normalizedReference) || normalizedReference.includes(fact),
  );
}

function violatesForbiddenAssumptions(text: string, jokeContextSnapshot: JokeContextSnapshot) {
  const normalizedText = normalizeForComparison(text);

  return jokeContextSnapshot.structuredContext.forbiddenAssumptions.some((assumption) => {
    const keywords = normalizeForComparison(assumption)
      .split(" ")
      .filter((word) => word.length > 4);

    if (keywords.length === 0) {
      return false;
    }

    return keywords.every((keyword) => normalizedText.includes(keyword));
  });
}

function looksCondescending(text: string, jokeTarget: string) {
  const normalized = normalizeForComparison(`${text} ${jokeTarget}`);

  return ["idiot", "moron", "stupid", "loser", "clown", "dumb user"].some((term) =>
    normalized.includes(term),
  );
}

function containsCheapProfanity(text: string) {
  const normalized = normalizeForComparison(text);

  return ["fuck", "fucking", "shit", "shitty", "bitch"].some((term) => normalized.includes(term));
}

function contextSupportsBoldCandidate(jokeContextSnapshot: JokeContextSnapshot) {
  return (
    extractNamedNewsActors(jokeContextSnapshot).length > 0 ||
    jokeContextSnapshot.structuredContext.jokeContextQuality.status === "strong"
  );
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

  return dedupe(actorMatches).slice(0, 3);
}

function buildContextTerms(jokeContextSnapshot: JokeContextSnapshot) {
  return dedupe(
    [
      ...jokeContextSnapshot.structuredContext.jokeableTensions,
      ...jokeContextSnapshot.structuredContext.supportingFacts,
      jokeContextSnapshot.structuredContext.replySignals.summary,
    ]
      .flatMap((value) =>
        normalizeForComparison(value)
          .split(" ")
          .filter((term) => term.length > 5),
      )
      .slice(0, 24),
  );
}

function normalizeForComparison(value: string) {
  return collapseWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collapseWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function countWords(value: string) {
  return collapseWhitespace(value).split(" ").filter(Boolean).length;
}

function dedupe(values: string[]) {
  return Array.from(new Set(values));
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
