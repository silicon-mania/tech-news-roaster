import {
  type DiscoverySweepDependencies,
  type DiscoverySweepResult,
  runDiscoverySweep,
} from "@/services/discovery/discovery-sweep";

export const dynamic = "force-dynamic";

/**
 * A Discovery Sweep starts up to the per-sweep cap of Automated Runs, each a heavy
 * pipeline (three-provider text generation + four image generations) composed
 * sequentially, so a sweep's wall-clock ≈ cap × per-run time. Elevate the serverless
 * duration so a full sweep finishes inside one invocation; the launch cap (3) is sized
 * to fit. Vercel clamps this to the plan/Fluid-compute maximum. See docs/deployment-v3.md.
 */
export const maxDuration = 800;

type SweepRouteEnv = Readonly<Record<string, string | undefined>>;

type DiscoverySweepRouteDependencies = {
  runSweep?: (
    input: Parameters<typeof runDiscoverySweep>[0],
    dependencies?: DiscoverySweepDependencies,
  ) => Promise<DiscoverySweepResult>;
  env?: SweepRouteEnv;
  now?: () => Date;
};

/**
 * Trailing-window lookback (hours) when {@link DISCOVERY_SWEEP_LOOKBACK_HOURS} is
 * unset. Deliberately larger than the 2-hour cron interval (issue 021) so consecutive
 * windows overlap and lose nothing at the edges — the seen-tweet record + cluster
 * dedup make overlap safe (PRD user story 12).
 */
const DEFAULT_LOOKBACK_HOURS = 3;

const DISCOVERY_SWEEP_LOOKBACK_HOURS = "DISCOVERY_SWEEP_LOOKBACK_HOURS";

/**
 * The single unattended entry point for the Discovery Sweep (issue 021). Vercel Cron
 * invokes this on the configured schedule (every 2 hours, see vercel.json) and sends
 * `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set, which gates the
 * route so an unprotected public hit can never start paid runs.
 */
export async function GET(request: Request) {
  return runScheduledDiscoverySweep(request);
}

export async function runScheduledDiscoverySweep(
  request: Request,
  {
    runSweep = runDiscoverySweep,
    env = process.env,
    now = () => new Date(),
  }: DiscoverySweepRouteDependencies = {},
) {
  const authorization = authorizeSweep(request, env);

  if (!authorization.ok) {
    return Response.json({ error: authorization.error }, { status: authorization.status });
  }

  // The Discovery Source: operator-owned X List ids (~5 lists for ~5000 follows).
  const listIds = parseListIds(env.DISCOVERY_SOURCE_LIST_IDS);

  if (listIds.length === 0) {
    return Response.json(
      { error: "No Discovery Source Lists configured (set DISCOVERY_SOURCE_LIST_IDS)." },
      { status: 503 },
    );
  }

  // Trailing window: until = now, since = now − lookback. The lookback exceeds the
  // cron interval so consecutive sweeps overlap.
  const until = now();
  const lookbackHours = parseLookbackHours(env[DISCOVERY_SWEEP_LOOKBACK_HOURS]);
  const since = new Date(until.getTime() - lookbackHours * 60 * 60 * 1000);

  const result = await runSweep({ listIds, window: { since, until } }, { env });

  return Response.json(summarizeSweep(result), {
    headers: { "Cache-Control": "no-store" },
    status: httpStatusFor(result),
  });
}

type SweepAuthorization = { ok: true } | { ok: false; status: number; error: string };

/**
 * Vercel Cron attaches `Authorization: Bearer ${CRON_SECRET}` to scheduled requests
 * when CRON_SECRET is set. We require a matching bearer whenever the secret exists.
 * With no secret configured we refuse in production (an unprotected public endpoint
 * must never start paid runs) but allow in development so the operator can trigger a
 * local sweep by hand — mirroring the codebase's "production requires keys, dev falls
 * back" pattern.
 */
function authorizeSweep(request: Request, env: SweepRouteEnv): SweepAuthorization {
  const secret = env.CRON_SECRET;

  if (!secret) {
    if (env.NODE_ENV === "production") {
      return {
        error: "Discovery Sweep is not configured (missing CRON_SECRET).",
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

function parseListIds(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((listId) => listId.trim())
    .filter((listId) => listId.length > 0);
}

function parseLookbackHours(raw: string | undefined): number {
  if (!raw) {
    return DEFAULT_LOOKBACK_HOURS;
  }

  const parsed = Number(raw);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOOKBACK_HOURS;
}

/**
 * A compact JSON summary for cron logs. Run ids are included so the operator can open
 * the started runs in the unified runs list; the full per-run detail stays in the
 * persisted runs themselves.
 */
function summarizeSweep(result: DiscoverySweepResult) {
  if (result.status === "completed") {
    return {
      droppedByCap: result.droppedByCap.length,
      joinedExistingClusters: result.joinedExistingClusters,
      runIds: result.startedRuns.map((run) => run.runId),
      startedRuns: result.startedRuns.length,
      status: result.status,
    };
  }

  return { status: result.status };
}

/**
 * `not-ready` is an expected, benign outcome (the Runtime Readiness Gate intentionally
 * held the sweep), so it is a 200. `unauthorized` means the Operator Account could not
 * be resolved — a real misconfiguration worth a failed-cron signal, so it is a 500.
 */
function httpStatusFor(result: DiscoverySweepResult): number {
  return result.status === "unauthorized" ? 500 : 200;
}
