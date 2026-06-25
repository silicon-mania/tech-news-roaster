import { describe, expect, test, vi } from "vitest";
import type {
  LaunchAutomatedRunDependencies,
  LaunchAutomatedRunResult,
} from "@/services/automated-run/launch-automated-run-from-tweet";
import { runBotIngest } from "./route";

const SECRET = "bot-secret";
const configuredEnv = { BOT_INGEST_SECRET: SECRET };

const completed: LaunchAutomatedRunResult = {
  status: "completed",
  runId: "run-1",
  runStatus: "completed",
  fanOut: {
    perOperator: [
      { email: "b@example.com", userId: "user-b", copied: 1, failed: 0 },
      { email: "c@example.com", userId: "user-c", copied: 0, failed: 1 },
    ],
    skippedUnprovisioned: ["unprovisioned@example.com"],
  },
};

function buildRequest({
  authorization,
  body = { tweetUrl: "https://x.com/openai/status/123" },
  rawBody,
}: {
  authorization?: string;
  body?: unknown;
  rawBody?: string;
} = {}) {
  return new Request("https://app.test/api/bot-ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: rawBody ?? JSON.stringify(body),
  });
}

function buildLaunch(result: LaunchAutomatedRunResult = completed) {
  return vi.fn(
    async (
      _input: { sourceTweetUrl: string },
      _dependencies?: LaunchAutomatedRunDependencies,
    ): Promise<LaunchAutomatedRunResult> => result,
  );
}

describe("bot ingest route", () => {
  test("rejects a request whose bearer token does not match BOT_INGEST_SECRET", async () => {
    const launch = buildLaunch();

    const response = await runBotIngest(buildRequest({ authorization: "Bearer wrong" }), {
      env: configuredEnv,
      launch,
    });

    expect(response.status).toBe(401);
    expect(launch).not.toHaveBeenCalled();
  });

  test("refuses in production when no secret is configured", async () => {
    const launch = buildLaunch();

    const response = await runBotIngest(buildRequest(), {
      env: { NODE_ENV: "production" },
      launch,
    });

    expect(response.status).toBe(503);
    expect(launch).not.toHaveBeenCalled();
  });

  test("allows an unauthenticated request in development (no secret set)", async () => {
    const launch = buildLaunch();

    const response = await runBotIngest(buildRequest(), { env: {}, launch });

    expect(response.status).toBe(200);
    expect(launch).toHaveBeenCalledWith(
      { sourceTweetUrl: "https://x.com/openai/status/123" },
      { env: {} },
    );
  });

  test("rejects a non-JSON body with 400", async () => {
    const launch = buildLaunch();

    const response = await runBotIngest(
      buildRequest({ authorization: `Bearer ${SECRET}`, rawBody: "not json" }),
      { env: configuredEnv, launch },
    );

    expect(response.status).toBe(400);
    expect(launch).not.toHaveBeenCalled();
  });

  test("rejects a missing or non-status tweetUrl with 400", async () => {
    const launch = buildLaunch();

    for (const body of [{}, { tweetUrl: "" }, { tweetUrl: "https://example.com/not-a-tweet" }]) {
      const response = await runBotIngest(
        buildRequest({ authorization: `Bearer ${SECRET}`, body }),
        { env: configuredEnv, launch },
      );

      expect(response.status).toBe(400);
    }

    expect(launch).not.toHaveBeenCalled();
  });

  test("trims the URL, launches the run, and returns its id, run status, and fan-out summary", async () => {
    const launch = buildLaunch();

    const response = await runBotIngest(
      buildRequest({
        authorization: `Bearer ${SECRET}`,
        body: { tweetUrl: "  https://twitter.com/openai/status/999  " },
      }),
      { env: configuredEnv, launch },
    );

    expect(launch).toHaveBeenCalledWith(
      { sourceTweetUrl: "https://twitter.com/openai/status/999" },
      { env: configuredEnv },
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "completed",
      runId: "run-1",
      runStatus: "completed",
      fanOut: {
        copiesPerOperator: [
          { email: "b@example.com", copied: 1, failed: 0 },
          { email: "c@example.com", copied: 0, failed: 1 },
        ],
        skippedUnprovisioned: ["unprovisioned@example.com"],
      },
    });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("maps a not-ready gate to 503 so the bot can retry later", async () => {
    const response = await runBotIngest(buildRequest({ authorization: `Bearer ${SECRET}` }), {
      env: configuredEnv,
      launch: buildLaunch({ status: "not-ready" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "not-ready" });
  });

  test("maps an unresolvable operator to 500", async () => {
    const response = await runBotIngest(buildRequest({ authorization: `Bearer ${SECRET}` }), {
      env: configuredEnv,
      launch: buildLaunch({ status: "unauthorized" }),
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ status: "unauthorized" });
  });
});
