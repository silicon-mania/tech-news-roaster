import "server-only";

import type { SavedGenerationRun } from "@/services/generation";
import { isDiscoverySweepReady, readRuntimeStatus } from "@/services/runtime-status";
import {
  type FanOutTargetsResolution,
  resolveFanOutTargets,
} from "@/services/saved-runs/resolve-fan-out-targets";
import { resolveHeadlessOperatorSession } from "@/services/saved-runs/resolve-headless-operator";
import { type OwnerResolution, resolveOwnerId } from "@/services/saved-runs/run-repository";
import {
  type ComposeAndFanOutDependencies,
  composeAndFanOutAutomatedRun,
  createFanOutAccumulator,
  type FanOutSummary,
} from "./compose-and-fan-out-automated-run";

type Environment = Readonly<Record<string, string | undefined>>;

export type LaunchAutomatedRunInput = { sourceTweetUrl: string };

/**
 * The structured log entries the bot-ingest launch emits — the same fan-out events the
 * Discovery Sweep logs, minus the sweep-only cap-drop/primary-operator entries.
 */
export type LaunchAutomatedRunLogEntry =
  | { event: "fan-out-skip-unprovisioned"; email: string }
  | { event: "fan-out-copy-failed"; email: string; runId: string; error: string };

type LaunchAutomatedRunLogger = (entry: LaunchAutomatedRunLogEntry) => void;

export type LaunchAutomatedRunResult =
  | { status: "not-ready" }
  | { status: "unauthorized" }
  | {
      status: "completed";
      runId: string;
      /** The persisted run's own outcome — composition persists failures, so a run can
       *  complete the *request* yet be a failed run. */
      runStatus: SavedGenerationRun["status"];
      fanOut: FanOutSummary;
    };

export type LaunchAutomatedRunDependencies = {
  /** The Runtime Readiness Gate. Defaults to reading runtime status and applying
   *  {@link isDiscoverySweepReady}; a `false` result starts nothing. */
  isReady?: () => Promise<boolean>;
  /** Resolves the anchor Operator Account headlessly (no session cookie). */
  resolveOwner?: () => Promise<OwnerResolution>;
  /** Resolves the signed-in operators the finished run is copied to. */
  resolveFanOutTargets?: () => Promise<FanOutTargetsResolution>;
  compose?: ComposeAndFanOutDependencies["compose"];
  fanOut?: ComposeAndFanOutDependencies["fanOut"];
  logger?: LaunchAutomatedRunLogger;
  env?: Environment;
};

/**
 * The bot-ingest entry point: the same server-driven Automated Run the Discovery
 * Sweep produces, but on a single operator-supplied tweet URL instead of a swept,
 * clustered, ranked batch — "discovery sweep minus the discovery". It honors the same
 * Runtime Readiness Gate, resolves the same headless Operator Account, composes
 * through the same {@link composeAndFanOutAutomatedRun} unit, and fans out to the same
 * signed-in operators. The discovery-specific machinery (seen-tweet dedup, clustering,
 * virality scoring, the Newsworthiness Filter, the per-sweep cap) is deliberately
 * skipped — the bot has already decided this tweet is worth a run.
 */
export async function launchAutomatedRunFromTweet(
  input: LaunchAutomatedRunInput,
  dependencies: LaunchAutomatedRunDependencies = {},
): Promise<LaunchAutomatedRunResult> {
  const env = dependencies.env ?? process.env;
  const isReady = dependencies.isReady ?? (() => defaultIsReady(env));
  const resolveOwner =
    dependencies.resolveOwner ?? (() => resolveOwnerId(env, resolveHeadlessOperatorSession));
  const resolveFanOut = dependencies.resolveFanOutTargets ?? (() => resolveFanOutTargets(env));
  const logger = dependencies.logger ?? defaultLogger;

  // The Runtime Readiness Gate. A not-ready system starts nothing.
  if (!(await isReady())) {
    return { status: "not-ready" };
  }

  // Resolve the anchor Operator Account. Unresolvable → start nothing rather than
  // persist an unowned run.
  const owner = await resolveOwner();

  if ("unauthorized" in owner) {
    return { status: "unauthorized" };
  }

  const fanOutTargets = await resolveFanOut();

  for (const email of fanOutTargets.skipped) {
    logger({ event: "fan-out-skip-unprovisioned", email });
  }

  const accumulator = createFanOutAccumulator({
    anchorOwnerId: owner.ownerId,
    targets: fanOutTargets.targets,
  });

  const launched = await composeAndFanOutAutomatedRun(
    { sourceTweetUrl: input.sourceTweetUrl },
    { anchorOwnerId: owner.ownerId, targets: fanOutTargets.targets },
    {
      env,
      ...(dependencies.compose ? { compose: dependencies.compose } : {}),
      ...(dependencies.fanOut ? { fanOut: dependencies.fanOut } : {}),
    },
  );

  if ("unauthorized" in launched) {
    return { status: "unauthorized" };
  }

  accumulator.record(launched.outcomes, {
    onCopyFailed: ({ email, error }) =>
      logger({ event: "fan-out-copy-failed", email, runId: launched.run.id, error }),
  });

  return {
    status: "completed",
    runId: launched.run.id,
    runStatus: launched.run.status,
    fanOut: accumulator.summary(fanOutTargets.skipped),
  };
}

async function defaultIsReady(env: Environment): Promise<boolean> {
  return isDiscoverySweepReady(await readRuntimeStatus({ env }));
}

const defaultLogger: LaunchAutomatedRunLogger = (entry) => {
  if (entry.event === "fan-out-skip-unprovisioned") {
    console.info(
      `[bot-ingest] fan-out-skip: ${entry.email} has no Operator Account yet — skipped (no backfill).`,
    );

    return;
  }

  console.warn(
    `[bot-ingest] fan-out-copy-failed: run ${entry.runId} could not be copied to ${entry.email} (${entry.error}); that operator misses this run.`,
  );
};
