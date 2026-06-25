import { describe, expect, test, vi } from "vitest";
import type { SavedGenerationRun } from "@/services/generation";
import type { FanOutCopyOutcome } from "@/services/saved-runs/fan-out-automated-run";
import type { composeAutomatedRun } from "./compose-automated-run";
import {
  type LaunchAutomatedRunDependencies,
  type LaunchAutomatedRunLogEntry,
  launchAutomatedRunFromTweet,
} from "./launch-automated-run-from-tweet";

const anchorOwnerId = "anchor-owner";
const teammateB = { email: "b@example.com", userId: "user-b" };
const teammateC = { email: "c@example.com", userId: "user-c" };
const anchorTarget = { email: "anchor@example.com", userId: anchorOwnerId };

const sourceTweetUrl = "https://x.com/a/status/123";

function fakeRun(
  id: string,
  status: SavedGenerationRun["status"] = "completed",
): SavedGenerationRun {
  return { id, status } as unknown as SavedGenerationRun;
}

function buildDeps(overrides: Partial<LaunchAutomatedRunDependencies> = {}) {
  const logs: LaunchAutomatedRunLogEntry[] = [];
  const composeCalls: Parameters<typeof composeAutomatedRun>[0][] = [];

  const compose = vi.fn<typeof composeAutomatedRun>(async (input) => {
    composeCalls.push(input);

    return { run: fakeRun("run-1") };
  });
  const fanOut = vi.fn(
    async ({
      anchorOwnerId: anchor,
      targets,
    }: {
      anchorOwnerId: string;
      targets: readonly { email: string; userId: string }[];
    }): Promise<FanOutCopyOutcome[]> =>
      targets
        .filter((target) => target.userId !== anchor)
        .map((target) => ({ email: target.email, userId: target.userId, status: "copied" })),
  );

  const deps: LaunchAutomatedRunDependencies = {
    isReady: async () => true,
    resolveOwner: async () => ({ ownerId: anchorOwnerId }),
    resolveFanOutTargets: async () => ({ targets: [], skipped: [] }),
    compose: compose as LaunchAutomatedRunDependencies["compose"],
    fanOut: fanOut as LaunchAutomatedRunDependencies["fanOut"],
    logger: (entry) => logs.push(entry),
    env: {},
    ...overrides,
  };

  return { deps, logs, composeCalls, compose, fanOut };
}

describe("launchAutomatedRunFromTweet", () => {
  test("composes a run from the tweet and reports its id, run status, and fan-out", async () => {
    const { deps, compose, fanOut } = buildDeps({
      resolveFanOutTargets: async () => ({
        targets: [anchorTarget, teammateB, teammateC],
        skipped: [],
      }),
    });

    const result = await launchAutomatedRunFromTweet({ sourceTweetUrl }, deps);

    // A directly-submitted tweet carries no cluster id.
    expect(compose).toHaveBeenCalledWith({ sourceTweetUrl }, expect.anything());
    expect(fanOut).toHaveBeenCalledWith(
      expect.objectContaining({ anchorOwnerId, targets: [anchorTarget, teammateB, teammateC] }),
      expect.anything(),
    );
    expect(result).toEqual({
      status: "completed",
      runId: "run-1",
      runStatus: "completed",
      fanOut: {
        perOperator: [
          { email: "b@example.com", userId: "user-b", copied: 1, failed: 0 },
          { email: "c@example.com", userId: "user-c", copied: 1, failed: 0 },
        ],
        skippedUnprovisioned: [],
      },
    });
  });

  test("starts nothing and returns not-ready when the Runtime Readiness Gate holds", async () => {
    const { deps, compose } = buildDeps({ isReady: async () => false });

    const result = await launchAutomatedRunFromTweet({ sourceTweetUrl }, deps);

    expect(result).toEqual({ status: "not-ready" });
    expect(compose).not.toHaveBeenCalled();
  });

  test("returns unauthorized and composes nothing when the operator cannot be resolved", async () => {
    const { deps, compose } = buildDeps({ resolveOwner: async () => ({ unauthorized: true }) });

    const result = await launchAutomatedRunFromTweet({ sourceTweetUrl }, deps);

    expect(result).toEqual({ status: "unauthorized" });
    expect(compose).not.toHaveBeenCalled();
  });

  test("returns unauthorized when the operator becomes unresolvable mid-compose", async () => {
    const { deps } = buildDeps({
      compose: (async () => ({ unauthorized: true })) as LaunchAutomatedRunDependencies["compose"],
    });

    const result = await launchAutomatedRunFromTweet({ sourceTweetUrl }, deps);

    expect(result).toEqual({ status: "unauthorized" });
  });

  test("reports a persisted failed run as completed-request with runStatus failed", async () => {
    const { deps } = buildDeps({
      compose: (async () => ({
        run: fakeRun("run-failed", "failed"),
      })) as LaunchAutomatedRunDependencies["compose"],
    });

    const result = await launchAutomatedRunFromTweet({ sourceTweetUrl }, deps);

    expect(result).toMatchObject({ status: "completed", runId: "run-failed", runStatus: "failed" });
  });

  test("logs skipped (un-provisioned) operators and isolates a failed copy", async () => {
    const { deps, logs } = buildDeps({
      resolveFanOutTargets: async () => ({
        targets: [anchorTarget, teammateB, teammateC],
        skipped: ["unprovisioned@example.com"],
      }),
      fanOut: (async ({ targets }: { targets: readonly { email: string; userId: string }[] }) =>
        targets
          .filter((target) => target.userId !== anchorOwnerId)
          .map((target) =>
            target.userId === teammateC.userId
              ? {
                  email: target.email,
                  userId: target.userId,
                  status: "failed" as const,
                  error: "storage down",
                }
              : { email: target.email, userId: target.userId, status: "copied" as const },
          )) as LaunchAutomatedRunDependencies["fanOut"],
    });

    const result = await launchAutomatedRunFromTweet({ sourceTweetUrl }, deps);

    expect(result).toMatchObject({
      status: "completed",
      fanOut: {
        perOperator: [
          { email: "b@example.com", userId: "user-b", copied: 1, failed: 0 },
          { email: "c@example.com", userId: "user-c", copied: 0, failed: 1 },
        ],
        skippedUnprovisioned: ["unprovisioned@example.com"],
      },
    });
    expect(logs).toContainEqual({
      event: "fan-out-skip-unprovisioned",
      email: "unprovisioned@example.com",
    });
    expect(logs).toContainEqual({
      event: "fan-out-copy-failed",
      email: "c@example.com",
      runId: "run-1",
      error: "storage down",
    });
  });
});
