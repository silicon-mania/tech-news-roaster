import { z } from "zod";
import {
  defaultNewsCategory,
  isNewsCategory,
  type JokeContextSnapshot,
  type NewsCategory,
  type NewsCategoryClassificationState,
  newsCategories,
} from "@/services/generation";
import { fetchWithTimeout, readTimeoutMs } from "@/utils/fetch-with-timeout";

/**
 * The News Category classifier service (ADR-0027 / issue 002). It selects one News
 * Category — the headline stamp on the Final Quote Tweet Image — from a run's Joke
 * Context Snapshot.
 *
 * Shaped as an injected, provider-style boundary like Joke Context Gathering and the
 * Newsworthiness Filter: a {@link NewsCategoryClassifier} provider abstracts the
 * model, with an AI-Gateway implementation, a deterministic local heuristic for
 * fixture development, and a `test` slot for injected fakes. The default reuses an
 * already-configured text model (the Anthropic text slot, via
 * `AI_GATEWAY_ANTHROPIC_MODEL`) through a single, low-temperature AI-Gateway call —
 * NOT three-provider, with NO Provider Fallback, adding NO new `AI_GATEWAY_*_MODEL`,
 * and NOT part of the Runtime Readiness Gate (it can never block a run from starting).
 *
 * It is subject to No Automatic Retry: {@link classifyNewsCategory} makes exactly one
 * call. On any failure (throw, timeout, off-vocabulary output) it yields a failed
 * classification state carrying a debug log, and the resolved value falls back to
 * VIRAL — the run is otherwise unaffected. The classifier's accuracy is validated by
 * hand against the eight labeled examples (the issue-002 HITL gate), never asserted
 * in automated tests.
 */

const defaultAiGatewayBaseUrl = "https://ai-gateway.vercel.sh/v1";
// The classifier reuses the configured Anthropic text model (ADR-0027: "reuses an
// already-configured text model; adds no new AI_GATEWAY_*_MODEL"). The default
// mirrors the Anthropic entry in services/generation/ai-gateway-models.ts;
// AI_GATEWAY_ANTHROPIC_MODEL overrides both in lockstep.
const defaultClassifierModel = "anthropic/claude-sonnet-4.6";
const maximumGatewayErrorLength = 500;
// A hung classification is bounded so it fails fast; on any failure the stamp falls
// back to VIRAL, so a slow model never blocks or breaks a run. It reuses the text
// model's existing timeout knob (no new env var); a classification is a short call,
// so the default ceiling is tighter than text generation's.
const defaultClassifierTimeoutMs = 30_000;

type NewsCategoryClassifierEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * The minimum the classifier reads: the four distilled fields of the Joke Context
 * Snapshot that frame the story (ADR-0027). It never sees a raw URL.
 */
export type NewsCategoryClassifierInput = {
  jokeContextSnapshot: JokeContextSnapshot;
};

/**
 * The vendor boundary for News Category classification. `provider` records which
 * implementation produced the pick and `model` is the configured model id (empty for
 * the local heuristic). `classify` returns one canonical vocabulary value as a raw
 * string; {@link classifyNewsCategory} validates membership and wraps the failure
 * path, so a provider just produces a candidate or throws.
 */
export type NewsCategoryClassifier = {
  model: string;
  provider: "ai-gateway" | "local" | "test";
  classify(input: NewsCategoryClassifierInput): Promise<string>;
};

/**
 * The boundary's result: the resolved stamp value (a vocabulary member on the happy
 * path, VIRAL on failure) and the terminal classification state to persist on the run
 * as `newsCategoryClassification`.
 */
export type NewsCategoryClassificationResult = {
  classification: NewsCategoryClassificationState;
  newsCategory: NewsCategory;
};

// The human-readable gloss for each value. Keyed by NewsCategory so TypeScript forces
// every member to be covered; the token set itself comes from `newsCategories` (issue
// 001: the vocabulary is never hard-coded a second time).
const newsCategoryDefinitions: Record<NewsCategory, string> = {
  ACQUIRED: "a company is bought or merged",
  DRAMA: "a controversy that fits none of the other values",
  DROPPED:
    "a substantial product or body of work ships — an app, a major release, an album, an AI model",
  FIRED: "someone is forced out, or staff are laid off",
  FUNDED: "a funding round in exchange for shares",
  LAUNCHED: "a new company appears or leaves stealth",
  PUBLISHED:
    "a lighter editorial or creative piece — an essay, an article, a single song, a research paper",
  RESIGNED: "someone voluntarily steps down",
  SIGNED: "a notable person joins a different company",
  VIRAL: "the residual — genuinely notable tech news that no more specific value fits",
};

// Built from `newsCategories` so the vocabulary is never re-listed: the token set has
// one source of truth and chip display order is preserved; only the gloss is authored.
const vocabularyLines = newsCategories
  .map((category) => `- ${category} — ${newsCategoryDefinitions[category]}.`)
  .join("\n");

/**
 * The classifier's system instruction: the closed vocabulary, the boundary rules, and
 * the operator's eight labeled examples as few-shot guidance (ADR-0027). The single
 * most important rule — classify by what the Source Tweet frames as the story — leads
 * the list. Exported so the contract test can assert it still carries the rules and
 * examples.
 */
export const newsCategoryClassifierInstruction = `
You classify one piece of tech news into exactly one News Category — the headline stamp on a tech-news "quote tweet" image.

Choose exactly one of these ten values and return it verbatim, uppercase:
${vocabularyLines}

Rules, in priority order:
- Classify by what the Source Tweet frames as the story, not a perspective-free truth. This is the single most important rule.
- The weight of the work separates DROPPED from PUBLISHED: a heavy body of work (an album, a major app, an AI model) is DROPPED; a lighter piece (a single song, an essay, an article, a research paper) is PUBLISHED.
- The same investment can be ACQUIRED, SIGNED, or FUNDED depending on who the tweet casts as the subject and the angle it takes.
- A specific event beats DRAMA when both fit: a CEO ousted amid scandal is FIRED, not DRAMA. DRAMA is only for controversy that no specific value covers.
- Mass layoffs are FIRED. Distinguish FIRED (forced out or laid off) from RESIGNED (voluntarily steps down).
- Use VIRAL only when nothing more specific applies.

Examples — read each as what the Source Tweet frames, then the value:
- A stealth startup shipping its first product AND announcing a seed round → LAUNCHED (the company arriving is the story).
- An existing company launching a standalone app → DROPPED.
- A new album → DROPPED; a single song → PUBLISHED.
- A research paper → PUBLISHED; a new AI model → DROPPED.
- A mass layoff → FIRED.
- An executive quitting company A while joining company B → SIGNED (the move into B is the story).
- A Microsoft stake in another company → ACQUIRED, SIGNED, or FUNDED depending on the tweet's framing.
- A viral tweet that is not itself a published work → VIRAL.

Return only JSON of the shape {"newsCategory": "ONE_OF_THE_TEN"}.
`.trim();

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

const classifierResponseSchema = z
  .object({
    newsCategory: z.string().min(1),
  })
  .passthrough();

class NewsCategoryClassifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NewsCategoryClassifierError";
  }
}

/**
 * Classify a run's News Category from its Joke Context Snapshot. Makes exactly one
 * call to the injected classifier (No Automatic Retry) and never throws. Returns the
 * resolved stamp plus the terminal state to persist: a vocabulary value + `completed`
 * on the happy path, or VIRAL + `failed` (with a debug log) on any throw, timeout, or
 * off-vocabulary pick.
 */
export async function classifyNewsCategory(
  { jokeContextSnapshot }: NewsCategoryClassifierInput,
  {
    classifier = createDefaultNewsCategoryClassifier(),
    now = () => new Date(),
  }: {
    classifier?: NewsCategoryClassifier;
    now?: () => Date;
  } = {},
): Promise<NewsCategoryClassificationResult> {
  const startedAt = now().toISOString();
  const debugLog = [
    `Classifying News Category for source tweet ${jokeContextSnapshot.sourceTweetId} via ${
      classifier.provider
    }${classifier.model ? ` (${classifier.model})` : ""}.`,
  ];

  try {
    const candidate = await classifier.classify({ jokeContextSnapshot });

    if (!isNewsCategory(candidate)) {
      throw new NewsCategoryClassifierError(
        `Classifier returned a value outside the vocabulary: "${candidate}".`,
      );
    }

    return {
      classification: {
        completedAt: now().toISOString(),
        startedAt,
        status: "completed",
      },
      newsCategory: candidate,
    };
  } catch (error) {
    const message = formatErrorMessage(error);
    debugLog.push(
      `Classification failed and the stamp fell back to ${defaultNewsCategory}: ${message}`,
    );

    return {
      classification: {
        debugLog,
        failedAt: now().toISOString(),
        message,
        startedAt,
        status: "failed",
      },
      newsCategory: defaultNewsCategory,
    };
  }
}

/**
 * Resolves the {@link NewsCategoryClassifier} to use. With AI-Gateway credentials it
 * is the model-backed classifier; otherwise it falls back to the deterministic local
 * heuristic so fixture development works without a backend (mirroring the
 * Newsworthiness Filter and the generation orchestrator).
 */
export function createDefaultNewsCategoryClassifier(
  env: NewsCategoryClassifierEnvironment = process.env,
): NewsCategoryClassifier {
  const model = readClassifierModel(env);
  const apiKey = readAiGatewayApiKey(env);

  if (!apiKey && env.NODE_ENV !== "production") {
    return createLocalNewsCategoryClassifier(model);
  }

  return createAiGatewayNewsCategoryClassifier({
    apiKey,
    baseUrl: readEnvValue(env.AI_GATEWAY_BASE_URL),
    model,
    timeoutMs: readClassifierTimeoutMs(env),
  });
}

/**
 * A deterministic, dependency-free local classifier for fixture development without a
 * backend. Intentionally coarse: it keyword-matches the snapshot and cannot read
 * framing the way the model can, so it falls back to VIRAL. The HITL-validated picks
 * always come from the AI-Gateway classifier, never this stand-in.
 */
export function createLocalNewsCategoryClassifier(
  model = readClassifierModel(process.env),
): NewsCategoryClassifier {
  return {
    model,
    provider: "local",
    async classify({ jokeContextSnapshot }) {
      return classifyWithLocalHeuristic(jokeContextSnapshot);
    },
  };
}

function createAiGatewayNewsCategoryClassifier({
  apiKey,
  baseUrl,
  model,
  timeoutMs,
}: {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  model: string;
  timeoutMs: number;
}): NewsCategoryClassifier {
  return {
    model,
    provider: "ai-gateway",
    async classify({ jokeContextSnapshot }) {
      if (!apiKey) {
        throw new NewsCategoryClassifierError("AI Gateway credentials are not configured.");
      }

      const response = await fetchWithTimeout(
        `${(baseUrl ?? defaultAiGatewayBaseUrl).replace(/\/$/, "")}/chat/completions`,
        {
          body: JSON.stringify({
            messages: [
              { content: newsCategoryClassifierInstruction, role: "system" },
              { content: buildClassifierPrompt(jokeContextSnapshot), role: "user" },
            ],
            model,
            temperature: 0,
          }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          operationLabel: "News Category classification",
          timeoutMs,
          upstreamLabel: "the AI Gateway",
        },
      );

      if (!response.ok) {
        throw new NewsCategoryClassifierError(
          `News Category classification failed (${response.status}): ${await readGatewayError(
            response,
          )}`,
        );
      }

      const payload = gatewayResponseSchema.parse(await response.json());
      const parsed = classifierResponseSchema.parse(
        JSON.parse(extractJsonObject(payload.choices[0].message.content)),
      );

      return parsed.newsCategory.trim().toUpperCase();
    },
  };
}

function buildClassifierPrompt(jokeContextSnapshot: JokeContextSnapshot) {
  const { structuredContext } = jokeContextSnapshot;

  return JSON.stringify({
    task: "Classify the News Category for this run's Final Quote Tweet Image stamp.",
    requiredOutput: { newsCategory: "one of the ten values, verbatim and uppercase" },
    sourceTweetClaim: structuredContext.sourceTweetClaim,
    authorContext: structuredContext.authorContext,
    jokeableTensions: structuredContext.jokeableTensions,
    supportingFacts: structuredContext.supportingFacts,
  });
}

// Coarse keyword mapping for the local stand-in only, in priority order so a specific
// event wins over the residual values. It reads the same three snapshot fields the
// model leans on and falls back to VIRAL when nothing fires.
function classifyWithLocalHeuristic(jokeContextSnapshot: JokeContextSnapshot): NewsCategory {
  const { structuredContext } = jokeContextSnapshot;
  const haystack = [
    structuredContext.sourceTweetClaim,
    ...structuredContext.supportingFacts,
    ...structuredContext.jokeableTensions,
  ]
    .join(" ")
    .toLowerCase();
  const tokens = new Set(haystack.match(/[a-z0-9]+/g) ?? []);
  const hasWord = (...words: string[]) => words.some((word) => tokens.has(word));
  const hasPhrase = (...phrases: string[]) => phrases.some((phrase) => haystack.includes(phrase));

  if (hasWord("acquires", "acquired", "acquisition", "merger", "merges", "buys", "bought")) {
    return "ACQUIRED";
  }
  if (hasWord("resigns", "resigned") || hasPhrase("steps down", "stepping down")) {
    return "RESIGNED";
  }
  if (
    hasWord("layoff", "layoffs", "fired", "fires", "ousted") ||
    hasPhrase("laid off", "forced out")
  ) {
    return "FIRED";
  }
  if (
    hasWord("funding", "funded", "raises", "raised", "seed", "valuation", "invests", "stake") ||
    hasPhrase("series a", "series b", "funding round")
  ) {
    return "FUNDED";
  }
  if (hasWord("joins", "signs", "signed", "hires", "hired", "poaches")) {
    return "SIGNED";
  }
  if (
    hasWord("launches", "launch", "launched", "unveils", "debuts") ||
    hasPhrase("out of stealth")
  ) {
    return "LAUNCHED";
  }
  if (
    hasWord("ships", "shipped", "releases", "released", "drops", "dropped", "app", "model", "album")
  ) {
    return "DROPPED";
  }
  if (hasWord("publishes", "published", "paper", "essay", "article", "blog", "song")) {
    return "PUBLISHED";
  }
  if (hasWord("controversy", "scandal", "backlash", "feud", "drama")) {
    return "DRAMA";
  }

  return defaultNewsCategory;
}

function formatErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unknown error";
}

function readClassifierModel(env: NewsCategoryClassifierEnvironment) {
  return readEnvValue(env.AI_GATEWAY_ANTHROPIC_MODEL) ?? defaultClassifierModel;
}

function readAiGatewayApiKey(env: NewsCategoryClassifierEnvironment) {
  return readEnvValue(env.AI_GATEWAY_API_KEY) ?? readEnvValue(env.VERCEL_AI_GATEWAY_API_KEY);
}

function readClassifierTimeoutMs(env: NewsCategoryClassifierEnvironment) {
  return readTimeoutMs(env.AI_GATEWAY_TEXT_TIMEOUT_MS, defaultClassifierTimeoutMs);
}

function readEnvValue(value: string | undefined) {
  const trimmedValue = value?.trim();

  return trimmedValue ? trimmedValue : undefined;
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
