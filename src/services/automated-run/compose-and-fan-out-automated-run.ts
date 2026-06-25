import "server-only";

import type { SavedGenerationRun } from "@/services/generation";
import {
  type FanOutCopyOutcome,
  type FanOutTarget,
  fanOutAutomatedRun,
} from "@/services/saved-runs/fan-out-automated-run";
import { resolveHeadlessOperatorSession } from "@/services/saved-runs/resolve-headless-operator";
import { composeAutomatedRun } from "./compose-automated-run";

type Environment = Readonly<Record<string, string | undefined>>;

/**
 * How many of a batch's Automated Runs were copied to one signed-in operator. The
 * anchor is excluded — it holds each composed original, not a copy.
 */
export type FanOutOperatorCount = {
  email: string;
  userId: string;
  copied: number;
  failed: number;
};

/**
 * The fan-out outcome of a batch of runs: per-operator copy counts, plus the
 * allowlisted operators skipped for not having an account yet.
 */
export type FanOutSummary = {
  perOperator: FanOutOperatorCount[];
  skippedUnprovisioned: string[];
};

/**
 * The anchor account a batch composes under and the operators its finished runs are
 * copied to. Resolved once per batch — a Discovery Sweep, or a single bot-ingest
 * request — and reused across every run it starts.
 */
export type FanOutContext = {
  anchorOwnerId: string;
  targets: readonly FanOutTarget[];
};

export type ComposeAndFanOutDependencies = {
  compose?: typeof composeAutomatedRun;
  fanOut?: typeof fanOutAutomatedRun;
  env?: Environment;
};

export type ComposeAndFanOutResult =
  | { unauthorized: true }
  | { run: SavedGenerationRun; outcomes: FanOutCopyOutcome[] };

/**
 * The single shared unit behind every server-driven Automated Run, used by both the
 * Discovery Sweep (one call per surviving News Coverage Cluster) and the bot-ingest
 * route (one call per submitted tweet). It composes the run under the **headless**
 * Operator Account — both callers run unattended, with no session cookie — and fans
 * the finished run out to the other signed-in operators.
 *
 * Returns `{ unauthorized: true }` when the operator becomes unresolvable while
 * composing (the caller stops rather than persist half-linked state); otherwise the
 * persisted run — which may itself be a *failed* run, since composition persists
 * failures rather than throwing — and the per-operator copy outcomes for the caller
 * to tally via {@link createFanOutAccumulator}.
 */
export async function composeAndFanOutAutomatedRun(
  input: { sourceTweetUrl: string; newsCoverageClusterId?: string },
  context: FanOutContext,
  dependencies: ComposeAndFanOutDependencies = {},
): Promise<ComposeAndFanOutResult> {
  const compose = dependencies.compose ?? composeAutomatedRun;
  const fanOut = dependencies.fanOut ?? fanOutAutomatedRun;
  const env = dependencies.env ?? process.env;

  const composed = await compose(
    {
      sourceTweetUrl: input.sourceTweetUrl,
      ...(input.newsCoverageClusterId
        ? { newsCoverageClusterId: input.newsCoverageClusterId }
        : {}),
    },
    // Unattended: no operator session cookie, so compose resolves the Operator
    // Account headlessly by allowlisted email (service-role admin).
    { operatorSession: resolveHeadlessOperatorSession, env },
  );

  if ("unauthorized" in composed) {
    return { unauthorized: true };
  }

  // Fan the finished run out to the other signed-in operators (best-effort per
  // operator). The anchor already holds this original — fanOut filters it out.
  const outcomes = await fanOut(
    { run: composed.run, anchorOwnerId: context.anchorOwnerId, targets: context.targets },
    { env },
  );

  return { run: composed.run, outcomes };
}

/**
 * A running tally of per-operator copy outcomes across a batch of Automated Runs.
 * Built once from the fan-out targets — the anchor excluded (it holds each original,
 * not a copy), allowlist order preserved — then fed each run's outcomes.
 */
export type FanOutAccumulator = {
  record(
    outcomes: readonly FanOutCopyOutcome[],
    options?: {
      onCopyFailed?: (failure: { email: string; userId: string; error: string }) => void;
    },
  ): void;
  summary(skippedUnprovisioned: string[]): FanOutSummary;
};

export function createFanOutAccumulator(context: FanOutContext): FanOutAccumulator {
  const countByOwnerId = new Map<string, FanOutOperatorCount>();

  for (const target of context.targets) {
    // The anchor holds each composed original, not a copy — never tallied.
    if (target.userId === context.anchorOwnerId) {
      continue;
    }

    countByOwnerId.set(target.userId, {
      email: target.email,
      userId: target.userId,
      copied: 0,
      failed: 0,
    });
  }

  return {
    record(outcomes, options) {
      for (const outcome of outcomes) {
        const counts = countByOwnerId.get(outcome.userId);

        if (!counts) {
          continue; // defensive: fanOut already excludes the anchor.
        }

        if (outcome.status === "copied") {
          counts.copied += 1;
        } else {
          counts.failed += 1;
          options?.onCopyFailed?.({
            email: outcome.email,
            userId: outcome.userId,
            error: outcome.error,
          });
        }
      }
    },
    summary(skippedUnprovisioned) {
      return {
        perOperator: [...countByOwnerId.values()],
        skippedUnprovisioned,
      };
    },
  };
}
