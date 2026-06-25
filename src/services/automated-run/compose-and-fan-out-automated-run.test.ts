import { describe, expect, test, vi } from "vitest";
import type { SavedGenerationRun } from "@/services/generation";
import type { FanOutCopyOutcome, FanOutTarget } from "@/services/saved-runs/fan-out-automated-run";
import {
  composeAndFanOutAutomatedRun,
  createFanOutAccumulator,
} from "./compose-and-fan-out-automated-run";
import type { composeAutomatedRun } from "./compose-automated-run";

const anchorOwnerId = "anchor-owner";
const teammateB: FanOutTarget = { email: "b@example.com", userId: "user-b" };
const teammateC: FanOutTarget = { email: "c@example.com", userId: "user-c" };
const anchorTarget: FanOutTarget = { email: "anchor@example.com", userId: anchorOwnerId };

function fakeRun(
  id: string,
  status: SavedGenerationRun["status"] = "completed",
): SavedGenerationRun {
  return { id, status } as unknown as SavedGenerationRun;
}

describe("composeAndFanOutAutomatedRun", () => {
  test("composes under the headless operator, then fans the finished run out", async () => {
    const compose = vi.fn<typeof composeAutomatedRun>(async () => ({ run: fakeRun("run-1") }));
    const fanOut = vi.fn(
      async (): Promise<FanOutCopyOutcome[]> => [
        { email: teammateB.email, userId: teammateB.userId, status: "copied" },
      ],
    );

    const result = await composeAndFanOutAutomatedRun(
      { sourceTweetUrl: "https://x.com/a/status/1", newsCoverageClusterId: "cluster-1" },
      { anchorOwnerId, targets: [anchorTarget, teammateB] },
      { compose, fanOut, env: {} },
    );

    // The cluster id is threaded through to composition.
    expect(compose).toHaveBeenCalledWith(
      { sourceTweetUrl: "https://x.com/a/status/1", newsCoverageClusterId: "cluster-1" },
      expect.objectContaining({ env: {} }),
    );
    // The finished run is handed to fan-out with the anchor and full target set.
    expect(fanOut).toHaveBeenCalledWith(
      expect.objectContaining({
        run: expect.objectContaining({ id: "run-1" }),
        anchorOwnerId,
        targets: [anchorTarget, teammateB],
      }),
      expect.objectContaining({ env: {} }),
    );
    expect(result).toEqual({
      run: expect.objectContaining({ id: "run-1" }),
      outcomes: [{ email: teammateB.email, userId: teammateB.userId, status: "copied" }],
    });
  });

  test("omits the cluster id when composing a directly-submitted tweet", async () => {
    const compose = vi.fn<typeof composeAutomatedRun>(async () => ({ run: fakeRun("run-2") }));
    const fanOut = vi.fn(async (): Promise<FanOutCopyOutcome[]> => []);

    await composeAndFanOutAutomatedRun(
      { sourceTweetUrl: "https://x.com/a/status/2" },
      { anchorOwnerId, targets: [] },
      { compose, fanOut, env: {} },
    );

    expect(compose).toHaveBeenCalledWith(
      { sourceTweetUrl: "https://x.com/a/status/2" },
      expect.anything(),
    );
  });

  test("returns unauthorized and never fans out when the operator is unresolvable", async () => {
    const compose = vi.fn<typeof composeAutomatedRun>(async () => ({ unauthorized: true }));
    const fanOut = vi.fn(async (): Promise<FanOutCopyOutcome[]> => []);

    const result = await composeAndFanOutAutomatedRun(
      { sourceTweetUrl: "https://x.com/a/status/3" },
      { anchorOwnerId, targets: [teammateB] },
      { compose, fanOut, env: {} },
    );

    expect(result).toEqual({ unauthorized: true });
    expect(fanOut).not.toHaveBeenCalled();
  });
});

describe("createFanOutAccumulator", () => {
  test("tallies per-operator copies, excluding the anchor and preserving target order", () => {
    const accumulator = createFanOutAccumulator({
      anchorOwnerId,
      targets: [anchorTarget, teammateB, teammateC],
    });

    // Two runs, both copied to teammate B; teammate C never received one — its zero
    // entry must still appear, in target order.
    accumulator.record([{ email: teammateB.email, userId: teammateB.userId, status: "copied" }]);
    accumulator.record([{ email: teammateB.email, userId: teammateB.userId, status: "copied" }]);

    expect(accumulator.summary([])).toEqual({
      perOperator: [
        { email: teammateB.email, userId: teammateB.userId, copied: 2, failed: 0 },
        { email: teammateC.email, userId: teammateC.userId, copied: 0, failed: 0 },
      ],
      skippedUnprovisioned: [],
    });
  });

  test("counts failures and reports each via onCopyFailed, then surfaces skipped operators", () => {
    const accumulator = createFanOutAccumulator({
      anchorOwnerId,
      targets: [teammateB, teammateC],
    });
    const failures: { email: string; userId: string; error: string }[] = [];

    accumulator.record(
      [
        { email: teammateB.email, userId: teammateB.userId, status: "copied" },
        {
          email: teammateC.email,
          userId: teammateC.userId,
          status: "failed",
          error: "storage down",
        },
      ],
      { onCopyFailed: (failure) => failures.push(failure) },
    );

    expect(failures).toEqual([
      { email: teammateC.email, userId: teammateC.userId, error: "storage down" },
    ]);
    expect(accumulator.summary(["unprovisioned@example.com"])).toEqual({
      perOperator: [
        { email: teammateB.email, userId: teammateB.userId, copied: 1, failed: 0 },
        { email: teammateC.email, userId: teammateC.userId, copied: 0, failed: 1 },
      ],
      skippedUnprovisioned: ["unprovisioned@example.com"],
    });
  });
});
