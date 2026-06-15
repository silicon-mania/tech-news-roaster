import { describe, expect, test, vi } from "vitest";
import type { OperatorAuthClient } from "@/services/auth/operator-auth";
import { requestOperatorCode } from "./route";

const configuredEnv = {
  OPERATOR_ALLOWLISTED_EMAIL: "operator@example.com",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SUPABASE_URL: "https://project.supabase.co",
};

function buildRequest(body: unknown) {
  return new Request("https://app.test/api/auth/request-code", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function buildAuthClient(overrides: Partial<OperatorAuthClient> = {}) {
  const requestCode = vi.fn(async () => ({ error: null }));
  const client: OperatorAuthClient = {
    requestCode,
    signOut: vi.fn(async () => ({ error: null })),
    verifyCode: vi.fn(async () => ({ error: null })),
    ...overrides,
  };

  return { client, requestCode };
}

describe("request operator code route", () => {
  test("sends a code to the allowlisted operator email", async () => {
    const { client, requestCode } = buildAuthClient();
    const createAuthClient = vi.fn(async () => client);

    const response = await requestOperatorCode(buildRequest({ email: "operator@example.com" }), {
      createAuthClient,
      env: configuredEnv,
    });

    expect(response.status).toBe(200);
    expect(requestCode).toHaveBeenCalledWith("operator@example.com");
  });

  test("refuses a non-allowlisted email without ever calling Supabase", async () => {
    const createAuthClient = vi.fn(async () => buildAuthClient().client);

    const response = await requestOperatorCode(buildRequest({ email: "intruder@example.com" }), {
      createAuthClient,
      env: configuredEnv,
    });

    expect(response.status).toBe(403);
    expect(createAuthClient).not.toHaveBeenCalled();
  });

  test("rejects a malformed email", async () => {
    const response = await requestOperatorCode(buildRequest({ email: "not-an-email" }), {
      createAuthClient: vi.fn(async () => buildAuthClient().client),
      env: configuredEnv,
    });

    expect(response.status).toBe(400);
  });

  test("reports 503 when Supabase is not configured", async () => {
    const response = await requestOperatorCode(buildRequest({ email: "operator@example.com" }), {
      createAuthClient: vi.fn(async () => buildAuthClient().client),
      env: {},
    });

    expect(response.status).toBe(503);
  });

  test("surfaces a provider failure as 502", async () => {
    const { client } = buildAuthClient({
      requestCode: vi.fn(async () => ({ error: { message: "rate limited" } })),
    });

    const response = await requestOperatorCode(buildRequest({ email: "operator@example.com" }), {
      createAuthClient: vi.fn(async () => client),
      env: configuredEnv,
    });

    expect(response.status).toBe(502);
  });
});
