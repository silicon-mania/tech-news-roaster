import { describe, expect, test, vi } from "vitest";
import type { OperatorAuthClient } from "@/services/auth/operator-auth";
import { verifyOperatorCode } from "./route";

const configuredEnv = {
  OPERATOR_ALLOWLISTED_EMAILS: "hugo@example.com, adil@example.com, gabriel@example.com",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SUPABASE_URL: "https://project.supabase.co",
};

function buildRequest(body: unknown) {
  return new Request("https://app.test/api/auth/verify-code", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function buildAuthClient(overrides: Partial<OperatorAuthClient> = {}) {
  const verifyCode = vi.fn(async () => ({ error: null }));
  const client: OperatorAuthClient = {
    requestCode: vi.fn(async () => ({ error: null })),
    signOut: vi.fn(async () => ({ error: null })),
    verifyCode,
    ...overrides,
  };

  return { client, verifyCode };
}

describe("verify operator code route", () => {
  test("signs the Primary Operator in with a valid code", async () => {
    const { client, verifyCode } = buildAuthClient();

    const response = await verifyOperatorCode(
      buildRequest({ code: "123456", email: "hugo@example.com" }),
      { createAuthClient: vi.fn(async () => client), env: configuredEnv },
    );

    expect(response.status).toBe(200);
    expect(verifyCode).toHaveBeenCalledWith({ code: "123456", email: "hugo@example.com" });
  });

  test("signs in any teammate in the allowlist, provisioning their own account", async () => {
    const { client, verifyCode } = buildAuthClient();

    // A non-first allowlisted teammate verifying for the first time provisions their
    // own separate Operator Account via the unchanged email-OTP flow.
    const response = await verifyOperatorCode(
      buildRequest({ code: "654321", email: "adil@example.com" }),
      { createAuthClient: vi.fn(async () => client), env: configuredEnv },
    );

    expect(response.status).toBe(200);
    expect(verifyCode).toHaveBeenCalledWith({ code: "654321", email: "adil@example.com" });
  });

  test("refuses a non-allowlisted email without calling Supabase", async () => {
    const createAuthClient = vi.fn(async () => buildAuthClient().client);

    const response = await verifyOperatorCode(
      buildRequest({ code: "123456", email: "intruder@example.com" }),
      { createAuthClient, env: configuredEnv },
    );

    expect(response.status).toBe(403);
    expect(createAuthClient).not.toHaveBeenCalled();
  });

  test("rejects an invalid or expired code with 401", async () => {
    const { client } = buildAuthClient({
      verifyCode: vi.fn(async () => ({ error: { message: "Token has expired" } })),
    });

    const response = await verifyOperatorCode(
      buildRequest({ code: "000000", email: "hugo@example.com" }),
      { createAuthClient: vi.fn(async () => client), env: configuredEnv },
    );

    expect(response.status).toBe(401);
  });

  test("rejects a missing code", async () => {
    const response = await verifyOperatorCode(buildRequest({ email: "hugo@example.com" }), {
      createAuthClient: vi.fn(async () => buildAuthClient().client),
      env: configuredEnv,
    });

    expect(response.status).toBe(400);
  });
});
