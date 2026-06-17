import { describe, expect, test, vi } from "vitest";
import {
  type OperatorUserLookup,
  resolveHeadlessOperatorSession,
} from "./resolve-headless-operator";

const configuredEnv = {
  OPERATOR_ALLOWLISTED_EMAIL: "Operator@Example.com",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service-role",
  SUPABASE_URL: "https://project.supabase.co",
};

function buildLookup(result: Awaited<ReturnType<OperatorUserLookup>> = null) {
  return vi.fn<OperatorUserLookup>(async () => result);
}

describe("resolveHeadlessOperatorSession", () => {
  test("resolves the operator by the allowlisted email via the admin lookup", async () => {
    const lookup = buildLookup({ email: "operator@example.com", userId: "user-1" });

    const session = await resolveHeadlessOperatorSession(configuredEnv, lookup);

    expect(session).toEqual({ email: "operator@example.com", userId: "user-1" });
    // The email is normalized (lower-cased) before lookup; the service-role config
    // is forwarded so the admin API can list users.
    expect(lookup).toHaveBeenCalledWith(
      { anonKey: "anon", serviceRoleKey: "service-role", url: "https://project.supabase.co" },
      "operator@example.com",
    );
  });

  test("returns null when Supabase is unconfigured (never reaches the admin lookup)", async () => {
    const lookup = buildLookup({ email: "operator@example.com", userId: "user-1" });

    const session = await resolveHeadlessOperatorSession({}, lookup);

    expect(session).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  test("returns null when no operator email is allowlisted", async () => {
    const lookup = buildLookup({ email: "operator@example.com", userId: "user-1" });
    const { OPERATOR_ALLOWLISTED_EMAIL: _omitted, ...envWithoutEmail } = configuredEnv;

    const session = await resolveHeadlessOperatorSession(envWithoutEmail, lookup);

    expect(session).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });

  test("returns null when no auth user matches the allowlisted email yet", async () => {
    // The operator has not signed in once, so their account does not exist — the
    // sweep then reports `unauthorized` rather than persisting unowned work.
    const lookup = buildLookup(null);

    const session = await resolveHeadlessOperatorSession(configuredEnv, lookup);

    expect(session).toBeNull();
    expect(lookup).toHaveBeenCalledTimes(1);
  });
});
