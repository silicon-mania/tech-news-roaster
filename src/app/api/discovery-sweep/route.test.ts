import { describe, expect, test, vi } from "vitest";
import type {
  DiscoverySweepDependencies,
  DiscoverySweepInput,
  DiscoverySweepResult,
} from "@/services/discovery/discovery-sweep";
import { runScheduledDiscoverySweep } from "./route";

const SECRET = "cron-secret";

const configuredEnv = {
  CRON_SECRET: SECRET,
  DISCOVERY_SOURCE_LIST_IDS: "list-1, list-2 ,list-3",
};

function buildRequest(authorization?: string) {
  return new Request("https://app.test/api/discovery-sweep", {
    headers: authorization ? { authorization } : {},
    method: "GET",
  });
}

const completed: DiscoverySweepResult = {
  droppedByCap: [{ authorRelativeScore: 4, sourceText: "dropped", sourceTweetId: "t-dropped" }],
  joinedExistingClusters: 2,
  startedRuns: [
    {
      authorRelativeScore: 9,
      clusterId: "c-1",
      runId: "run-1",
      sourceTweetId: "t-1",
      sourceTweetUrl: "https://x.com/a/status/1",
    },
  ],
  status: "completed",
};

function buildSweep(result: DiscoverySweepResult = completed) {
  return vi.fn(
    async (
      _input: DiscoverySweepInput,
      _dependencies?: DiscoverySweepDependencies,
    ): Promise<DiscoverySweepResult> => result,
  );
}

describe("discovery sweep route", () => {
  test("rejects a request whose bearer token does not match CRON_SECRET", async () => {
    const runSweep = buildSweep();

    const response = await runScheduledDiscoverySweep(buildRequest("Bearer wrong"), {
      env: configuredEnv,
      runSweep,
    });

    expect(response.status).toBe(401);
    expect(runSweep).not.toHaveBeenCalled();
  });

  test("rejects a request with no authorization header when a secret is configured", async () => {
    const runSweep = buildSweep();

    const response = await runScheduledDiscoverySweep(buildRequest(), {
      env: configuredEnv,
      runSweep,
    });

    expect(response.status).toBe(401);
    expect(runSweep).not.toHaveBeenCalled();
  });

  test("runs the sweep over the parsed Discovery Source Lists in a trailing window", async () => {
    const runSweep = buildSweep();

    const response = await runScheduledDiscoverySweep(buildRequest(`Bearer ${SECRET}`), {
      env: configuredEnv,
      now: () => new Date("2026-06-16T12:00:00.000Z"),
      runSweep,
    });

    expect(response.status).toBe(200);
    // Parsed (trimmed) list ids, and until = now, since = now − default lookback (3h).
    expect(runSweep).toHaveBeenCalledWith(
      {
        listIds: ["list-1", "list-2", "list-3"],
        window: {
          since: new Date("2026-06-16T09:00:00.000Z"),
          until: new Date("2026-06-16T12:00:00.000Z"),
        },
      },
      { env: configuredEnv },
    );
  });

  test("honors a DISCOVERY_SWEEP_LOOKBACK_HOURS override", async () => {
    const runSweep = buildSweep();
    const env = { ...configuredEnv, DISCOVERY_SWEEP_LOOKBACK_HOURS: "6" };

    await runScheduledDiscoverySweep(buildRequest(`Bearer ${SECRET}`), {
      env,
      now: () => new Date("2026-06-16T12:00:00.000Z"),
      runSweep,
    });

    expect(runSweep).toHaveBeenCalledWith(
      expect.objectContaining({
        window: {
          since: new Date("2026-06-16T06:00:00.000Z"),
          until: new Date("2026-06-16T12:00:00.000Z"),
        },
      }),
      { env },
    );
  });

  test("summarizes a completed sweep with counts and run ids", async () => {
    const response = await runScheduledDiscoverySweep(buildRequest(`Bearer ${SECRET}`), {
      env: configuredEnv,
      runSweep: buildSweep(),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      droppedByCap: 1,
      joinedExistingClusters: 2,
      runIds: ["run-1"],
      startedRuns: 1,
      status: "completed",
    });
  });

  test("returns 200 for a not-ready sweep (the gate intentionally held it)", async () => {
    const response = await runScheduledDiscoverySweep(buildRequest(`Bearer ${SECRET}`), {
      env: configuredEnv,
      runSweep: buildSweep({ status: "not-ready" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "not-ready" });
  });

  test("returns 500 when the Operator Account is unresolvable (unauthorized)", async () => {
    const response = await runScheduledDiscoverySweep(buildRequest(`Bearer ${SECRET}`), {
      env: configuredEnv,
      runSweep: buildSweep({ status: "unauthorized" }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ status: "unauthorized" });
  });

  test("refuses with 503 when no Discovery Source Lists are configured", async () => {
    const runSweep = buildSweep();

    const response = await runScheduledDiscoverySweep(buildRequest(`Bearer ${SECRET}`), {
      env: { CRON_SECRET: SECRET },
      runSweep,
    });

    expect(response.status).toBe(503);
    expect(runSweep).not.toHaveBeenCalled();
  });

  test("refuses in production when CRON_SECRET is missing", async () => {
    const runSweep = buildSweep();

    const response = await runScheduledDiscoverySweep(buildRequest(), {
      env: { DISCOVERY_SOURCE_LIST_IDS: "list-1", NODE_ENV: "production" },
      runSweep,
    });

    expect(response.status).toBe(503);
    expect(runSweep).not.toHaveBeenCalled();
  });

  test("allows an unauthenticated local sweep in development (no secret configured)", async () => {
    const runSweep = buildSweep();

    const response = await runScheduledDiscoverySweep(buildRequest(), {
      env: { DISCOVERY_SOURCE_LIST_IDS: "list-1", NODE_ENV: "development" },
      runSweep,
    });

    expect(response.status).toBe(200);
    expect(runSweep).toHaveBeenCalledTimes(1);
  });
});
