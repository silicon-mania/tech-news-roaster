import { z } from "zod";
import { readAiGatewayApiKey } from "@/services/generation/ai-gateway-models";
import { fetchWithTimeout, readTimeoutMs } from "@/utils/fetch-with-timeout";

/**
 * The Newsworthiness Filter (issue 017): the lightweight, permissive language-model
 * judgment applied to a News Coverage Cluster's Source Tweet before an expensive
 * Automated Run commits. It decides whether the tweet is tech news worth a recap
 * rather than off-topic viral noise (memes, personal drama).
 *
 * The judgment runs against the vendor boundary through a provider abstraction:
 * a `NewsworthinessJudge` provider abstracts the model, with an AI-Gateway impl, a
 * deterministic local heuristic for fixture development, and a `test` slot for
 * injected judges. The decision is **biased permissive** (recall over precision):
 * borderline tech news is kept, and only clear noise with no tech signal is dropped.
 */

const defaultAiGatewayBaseUrl = "https://ai-gateway.vercel.sh/v1";
const defaultNewsworthinessModel = "openai/gpt-5.4-mini";
const maximumGatewayErrorLength = 500;
// A hung newsworthiness call is bounded so it fails fast; on any failure the filter
// keeps the tweet (permissive — see judge-error handling in filter-newsworthy-clusters),
// so a slow judge never silently drops real news. Tunable via
// AI_GATEWAY_NEWSWORTHINESS_TIMEOUT_MS.
const defaultNewsworthinessTimeoutMs = 30_000;

type NewsworthinessEnvironment = Readonly<Record<string, string | undefined>>;

/**
 * The minimum a Source Tweet must carry to be judged: its `text` (the primary
 * signal) and whether it carries its own media. Decoupled from `ClusterableTweet`
 * so the judgment never depends on clustering internals.
 */
export type NewsworthinessSubject = {
  text: string;
  hasMedia: boolean;
};

/**
 * A judgment: whether the subject is tech news worth a recap (`newsworthy`) plus a
 * short human-readable `reason`. A `false` verdict drops the tweet permanently.
 */
export type NewsworthinessVerdict = {
  newsworthy: boolean;
  reason: string;
};

/**
 * The vendor boundary for the Newsworthiness Filter. `provider` records which
 * implementation produced the verdict, and `model` is the configured model id
 * (empty for the local heuristic).
 */
export type NewsworthinessJudge = {
  model: string;
  provider: "ai-gateway" | "local" | "test";
  judge(subject: NewsworthinessSubject): Promise<NewsworthinessVerdict>;
};

/**
 * The documented default instruction handed to the model. Like the virality and
 * clustering defaults it is a deliberately permissive starting value, not a tuned
 * prompt: exact wording is deferred to issue 021. It leans the model toward keeping
 * borderline tech news and dropping only clear off-topic noise.
 */
export const defaultNewsworthinessInstruction = `
You are a permissive newsworthiness filter for a tech-news commentary tool.
Decide whether one tweet is tech news worth a recap, or off-topic viral noise such as a meme, a joke with no news, or personal drama.
Bias strongly toward keeping: recall matters more than precision here, so when a tweet is borderline or could plausibly be tech news, keep it.
Reject only when the tweet is clearly off-topic noise with no tech-news substance.
Treat product launches, funding, acquisitions, layoffs, outages, security incidents, model releases, research, and company or founder news as tech news worth keeping.
Return only JSON of the shape {"newsworthy": boolean, "reason": "one short sentence"}.
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

const verdictSchema = z
  .object({
    newsworthy: z.boolean(),
    reason: z.string().trim().min(1),
  })
  .strict();

class NewsworthinessJudgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NewsworthinessJudgeError";
  }
}

/**
 * Resolves the {@link NewsworthinessJudge} to use. With AI-Gateway credentials it is
 * the model-backed judge; otherwise it falls back to the deterministic local
 * heuristic so fixture development works without a backend.
 */
export function createDefaultNewsworthinessJudge(
  env: NewsworthinessEnvironment = process.env,
): NewsworthinessJudge {
  const model = readConfiguredModel(env);
  // The Newsworthiness Filter runs only inside the unattended Discovery Sweep
  // (cron), so it always bills the spend-capped automated key.
  const apiKey = readAiGatewayApiKey(env, "automated");

  if (!apiKey && env.NODE_ENV !== "production") {
    return createLocalNewsworthinessJudge(model);
  }

  return createAiGatewayNewsworthinessJudge({
    apiKey,
    baseUrl: readEnvValue(env.AI_GATEWAY_BASE_URL),
    instruction: defaultNewsworthinessInstruction,
    model,
    timeoutMs: readNewsworthinessTimeoutMs(env),
  });
}

// Single-word tech signals; presence of any one keeps the tweet. Word-boundary
// matched (tokenized) so "ai" never fires inside "said". A permissive placeholder
// for the model-backed judge, tuned with the rest of the discovery numbers in 021.
const techSignalWords = new Set([
  "ai",
  "ml",
  "llm",
  "gpt",
  "model",
  "models",
  "launch",
  "launches",
  "launched",
  "ship",
  "ships",
  "shipped",
  "release",
  "releases",
  "released",
  "beta",
  "api",
  "app",
  "apps",
  "software",
  "hardware",
  "chip",
  "chips",
  "gpu",
  "gpus",
  "startup",
  "startups",
  "founder",
  "founders",
  "ceo",
  "cto",
  "funding",
  "raise",
  "raises",
  "raised",
  "seed",
  "valuation",
  "ipo",
  "acquire",
  "acquires",
  "acquired",
  "acquisition",
  "merger",
  "layoff",
  "layoffs",
  "outage",
  "breach",
  "security",
  "vulnerability",
  "exploit",
  "openai",
  "anthropic",
  "google",
  "apple",
  "microsoft",
  "meta",
  "amazon",
  "nvidia",
  "tesla",
  "stripe",
  "platform",
  "cloud",
  "data",
  "database",
  "crypto",
  "blockchain",
  "token",
  "agent",
  "agents",
  "feature",
  "framework",
  "sdk",
  "github",
  "server",
  "benchmark",
  "dataset",
  "robot",
  "robotics",
  "quantum",
  "semiconductor",
  "fintech",
  "saas",
]);

const techSignalPhrases = ["open source", "series a", "series b", "data center"];

// Single-word noise markers; only ever reject when a noise marker is present AND
// no tech signal is, so the filter sheds clear memes and personal drama without
// touching borderline tech news.
const noiseMarkerWords = new Set([
  "lol",
  "lmao",
  "lmfao",
  "rofl",
  "meme",
  "memes",
  "birthday",
  "crush",
  "breakup",
  "divorce",
  "cheated",
  "cheating",
  "drama",
  "beef",
  "feud",
  "vibes",
  "horoscope",
  "zodiac",
  "astrology",
  "wordle",
  "brunch",
  "hangover",
]);

const noiseMarkerPhrases = [
  "happy birthday",
  "good morning",
  "good night",
  "love you",
  "my ex",
  "broke up",
  "who else",
  "team no sleep",
  "rip bozo",
];

/**
 * A deterministic, dependency-free local judge: it keeps the tweet unless the text
 * shows a clear noise marker (meme / personal drama) and carries no tech signal at
 * all. Intentionally coarse and permissive — a recall-favoring stand-in for the
 * model-backed judge, fully testable without a model.
 */
export function createLocalNewsworthinessJudge(
  model = readConfiguredModel(process.env),
): NewsworthinessJudge {
  return {
    model,
    provider: "local",
    async judge({ text }) {
      const hasTechSignal = countSignals(text, techSignalWords, techSignalPhrases) > 0;
      const hasNoiseMarker = countSignals(text, noiseMarkerWords, noiseMarkerPhrases) > 0;
      const newsworthy = hasTechSignal || !hasNoiseMarker;

      return {
        newsworthy,
        reason: newsworthy
          ? hasTechSignal
            ? "Carries a tech-news signal; kept."
            : "No clear off-topic noise; kept (permissive)."
          : "Off-topic noise with no tech-news signal; dropped.",
      };
    },
  };
}

function createAiGatewayNewsworthinessJudge({
  apiKey,
  baseUrl,
  instruction,
  model,
  timeoutMs,
}: {
  apiKey: string | undefined;
  baseUrl: string | undefined;
  instruction: string;
  model: string;
  timeoutMs: number;
}): NewsworthinessJudge {
  return {
    model,
    provider: "ai-gateway",
    async judge(subject) {
      if (!apiKey) {
        throw new NewsworthinessJudgeError("AI Gateway credentials are not configured.");
      }

      const response = await fetchWithTimeout(
        `${(baseUrl ?? defaultAiGatewayBaseUrl).replace(/\/$/, "")}/chat/completions`,
        {
          body: JSON.stringify({
            messages: [
              { content: instruction, role: "system" },
              { content: buildGatewayPrompt(subject), role: "user" },
            ],
            model,
            temperature: 0,
          }),
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          method: "POST",
          operationLabel: "Newsworthiness filter",
          timeoutMs,
          upstreamLabel: "the AI Gateway",
        },
      );

      if (!response.ok) {
        throw new NewsworthinessJudgeError(
          `Newsworthiness filter failed (${response.status}): ${await readGatewayError(response)}`,
        );
      }

      const payload = gatewayResponseSchema.parse(await response.json());

      return verdictSchema.parse(JSON.parse(extractJsonObject(payload.choices[0].message.content)));
    },
  };
}

function buildGatewayPrompt(subject: NewsworthinessSubject) {
  return JSON.stringify({
    task: "Judge whether this tweet is tech news worth a recap or off-topic viral noise.",
    requiredOutput: { newsworthy: "boolean", reason: "one short sentence" },
    tweet: { text: subject.text, hasMedia: subject.hasMedia },
  });
}

function countSignals(text: string, words: Set<string>, phrases: string[]): number {
  const lower = text.toLowerCase();
  const tokens = new Set(lower.match(/[a-z0-9]+/g) ?? []);
  let count = 0;

  for (const word of words) {
    if (tokens.has(word)) {
      count += 1;
    }
  }

  for (const phrase of phrases) {
    if (lower.includes(phrase)) {
      count += 1;
    }
  }

  return count;
}

function readConfiguredModel(env: NewsworthinessEnvironment) {
  return readEnvValue(env.AI_GATEWAY_NEWSWORTHINESS_MODEL) ?? defaultNewsworthinessModel;
}

function readNewsworthinessTimeoutMs(env: NewsworthinessEnvironment) {
  return readTimeoutMs(env.AI_GATEWAY_NEWSWORTHINESS_TIMEOUT_MS, defaultNewsworthinessTimeoutMs);
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
