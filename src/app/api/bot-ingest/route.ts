import {
  type LaunchAutomatedRunDependencies,
  type LaunchAutomatedRunResult,
  launchAutomatedRunFromTweet,
} from "@/services/automated-run/launch-automated-run-from-tweet";

export const dynamic = "force-dynamic";

/**
 * A bot-ingest request composes a single Automated Run — the same heavy pipeline a
 * Discovery Sweep run uses (three-provider text generation + four image generations).
 * Elevate the serverless duration to the same envelope as one sweep run so it finishes
 * inside one invocation. Vercel clamps this to the plan/Fluid-compute maximum. See
 * docs/deployment.md.
 */
export const maxDuration = 800;

type BotIngestEnv = Readonly<Record<string, string | undefined>>;

type BotIngestRouteDependencies = {
  launch?: (
    input: { sourceTweetUrl: string },
    dependencies?: LaunchAutomatedRunDependencies,
  ) => Promise<LaunchAutomatedRunResult>;
  env?: BotIngestEnv;
};

const BOT_INGEST_SECRET = "BOT_INGEST_SECRET";

/**
 * The bot-ingest entry point (the bot's equivalent of the cron's `/api/discovery-sweep`).
 * An external bot POSTs `{ "tweetUrl": "..." }` and the app composes the Final Quote
 * Repost as a server-driven Automated Run, exactly as a Discovery Sweep would — only
 * the discovery (sweep → cluster → rank) is skipped. The route is gated by
 * {@link BOT_INGEST_SECRET}, a dedicated secret separate from the cron's `CRON_SECRET`
 * so it can be rotated independently and an unprotected public hit can never start
 * paid runs.
 */
export async function POST(request: Request) {
  return runBotIngest(request);
}

export async function runBotIngest(
  request: Request,
  { launch = launchAutomatedRunFromTweet, env = process.env }: BotIngestRouteDependencies = {},
) {
  const authorization = authorizeBotIngest(request, env);

  if (!authorization.ok) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }

  const tweetUrl = await readTweetUrl(request);

  if (!tweetUrl.ok) {
    return Response.json({ error: tweetUrl.error }, { status: 400 });
  }

  const result = await launch({ sourceTweetUrl: tweetUrl.value }, { env });

  return Response.json(summarize(result), {
    headers: { "Cache-Control": "no-store" },
    status: httpStatusFor(result),
  });
}

type BotIngestAuthorization = { ok: true } | { ok: false; status: number; error: string };

/**
 * Requires `Authorization: Bearer ${BOT_INGEST_SECRET}` whenever the secret is set.
 * With no secret configured we refuse in production (an unprotected public endpoint
 * must never start paid runs) but allow in development so the operator can trigger a
 * local run by hand — mirroring {@link authorizeSweep} and the codebase's "production
 * requires keys, dev falls back" pattern.
 */
function authorizeBotIngest(request: Request, env: BotIngestEnv): BotIngestAuthorization {
  const secret = env[BOT_INGEST_SECRET];

  if (!secret) {
    if (env.NODE_ENV === "production") {
      return {
        error: "Bot ingest is not configured (missing BOT_INGEST_SECRET).",
        ok: false,
        status: 503,
      };
    }

    return { ok: true };
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return { error: "Unauthorized.", ok: false, status: 401 };
  }

  return { ok: true };
}

type TweetUrlResult = { ok: true; value: string } | { ok: false; error: string };

async function readTweetUrl(request: Request): Promise<TweetUrlResult> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return { error: "Request body must be JSON.", ok: false };
  }

  const raw =
    typeof body === "object" && body !== null && "tweetUrl" in body
      ? (body as { tweetUrl: unknown }).tweetUrl
      : undefined;

  if (typeof raw !== "string" || raw.trim().length === 0) {
    return {
      error: "Provide the tweet URL as a non-empty string field 'tweetUrl'.",
      ok: false,
    };
  }

  const value = raw.trim();

  if (!isStatusUrl(value)) {
    return { error: "tweetUrl must be an x.com or twitter.com status URL.", ok: false };
  }

  return { ok: true, value };
}

/**
 * A light gate so obviously-wrong input fails fast with a 400 rather than burning a
 * paid composition on a doomed retrieval. The deep validation still lives in tweet
 * retrieval — this only confirms the shape: an http(s) X/Twitter status URL.
 */
function isStatusUrl(value: string): boolean {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return false;
  }

  const host = url.hostname.toLowerCase().replace(/^(www\.|mobile\.)/, "");

  if (host !== "x.com" && host !== "twitter.com") {
    return false;
  }

  return /\/status\/\d+/.test(url.pathname);
}

/**
 * A compact JSON summary. The started run's id is returned so the bot can correlate
 * it with the run that appears in the unified runs list; `runStatus` tells the bot
 * whether the composition itself succeeded (a failed run is still persisted and 200).
 */
function summarize(result: LaunchAutomatedRunResult) {
  if (result.status === "completed") {
    return {
      fanOut: {
        copiesPerOperator: result.fanOut.perOperator.map((operator) => ({
          email: operator.email,
          copied: operator.copied,
          failed: operator.failed,
        })),
        skippedUnprovisioned: result.fanOut.skippedUnprovisioned,
      },
      runId: result.runId,
      runStatus: result.runStatus,
      status: result.status,
    };
  }

  return { status: result.status };
}

/**
 * `not-ready` means the Runtime Readiness Gate held the run — unlike the fire-and-forget
 * cron (which logs a benign 200), a synchronous bot caller benefits from a 503 retry
 * signal. `unauthorized` means the Operator Account could not be resolved — a real
 * misconfiguration, 500. A completed *request* is 200 even when the run itself failed:
 * the run is persisted and visible, and `runStatus` reports which it was.
 */
function httpStatusFor(result: LaunchAutomatedRunResult): number {
  if (result.status === "not-ready") {
    return 503;
  }

  if (result.status === "unauthorized") {
    return 500;
  }

  return 200;
}
