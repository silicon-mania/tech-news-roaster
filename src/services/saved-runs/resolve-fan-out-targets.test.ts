import { describe, expect, test, vi } from "vitest";
import type { OperatorSession } from "@/services/auth/operator-session";
import { type AllowlistedOperatorLookup, resolveFanOutTargets } from "./resolve-fan-out-targets";

const supabaseEnv = {
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

function accounts(...sessions: OperatorSession[]): Map<string, OperatorSession> {
  return new Map(sessions.map((session) => [session.email.trim().toLowerCase(), session]));
}

describe("resolveFanOutTargets", () => {
  test("returns every signed-in allowlisted operator as a target, in allowlist order", async () => {
    const lookup = vi.fn<AllowlistedOperatorLookup>(async () =>
      accounts(
        { email: "primary@example.com", userId: "user-primary" },
        { email: "second@example.com", userId: "user-second" },
        { email: "third@example.com", userId: "user-third" },
      ),
    );

    const resolution = await resolveFanOutTargets(
      {
        ...supabaseEnv,
        OPERATOR_ALLOWLISTED_EMAILS: "primary@example.com, second@example.com, third@example.com",
      },
      lookup,
    );

    expect(resolution.targets).toEqual([
      { email: "primary@example.com", userId: "user-primary" },
      { email: "second@example.com", userId: "user-second" },
      { email: "third@example.com", userId: "user-third" },
    ]);
    expect(resolution.skipped).toEqual([]);
  });

  test("skips allowlisted operators that have no account yet (un-provisioned)", async () => {
    // Only the primary has signed in; the other two teammates are not provisioned.
    const lookup = vi.fn<AllowlistedOperatorLookup>(async () =>
      accounts({ email: "primary@example.com", userId: "user-primary" }),
    );

    const resolution = await resolveFanOutTargets(
      {
        ...supabaseEnv,
        OPERATOR_ALLOWLISTED_EMAILS: "primary@example.com, second@example.com, third@example.com",
      },
      lookup,
    );

    expect(resolution.targets).toEqual([{ email: "primary@example.com", userId: "user-primary" }]);
    expect(resolution.skipped).toEqual(["second@example.com", "third@example.com"]);
  });

  test("matches the allowlist case- and whitespace-insensitively", async () => {
    const lookup = vi.fn<AllowlistedOperatorLookup>(async (_config, allowlist) => {
      // The resolver normalizes the allowlist before handing it to the lookup.
      expect([...allowlist]).toEqual(["primary@example.com", "second@example.com"]);

      return accounts({ email: "Primary@Example.com", userId: "user-primary" });
    });

    const resolution = await resolveFanOutTargets(
      { ...supabaseEnv, OPERATOR_ALLOWLISTED_EMAILS: " Primary@Example.com , second@example.com " },
      lookup,
    );

    expect(resolution.targets).toEqual([{ email: "Primary@Example.com", userId: "user-primary" }]);
    expect(resolution.skipped).toEqual(["second@example.com"]);
  });

  test("resolves nothing when Supabase is unconfigured (local single-operator dev)", async () => {
    const lookup = vi.fn<AllowlistedOperatorLookup>();

    const resolution = await resolveFanOutTargets(
      { OPERATOR_ALLOWLISTED_EMAILS: "primary@example.com, second@example.com" },
      lookup,
    );

    expect(resolution).toEqual({ targets: [], skipped: [] });
    expect(lookup).not.toHaveBeenCalled();
  });

  test("resolves nothing when the allowlist is empty", async () => {
    const lookup = vi.fn<AllowlistedOperatorLookup>();

    const resolution = await resolveFanOutTargets(supabaseEnv, lookup);

    expect(resolution).toEqual({ targets: [], skipped: [] });
    expect(lookup).not.toHaveBeenCalled();
  });

  test("degrades to skipping every operator when the account lookup fails", async () => {
    // A transient admin-API failure surfaces as an empty account map; the sweep then
    // copies nothing this cycle but the anchor's run is untouched.
    const lookup = vi.fn<AllowlistedOperatorLookup>(async () => new Map());

    const resolution = await resolveFanOutTargets(
      { ...supabaseEnv, OPERATOR_ALLOWLISTED_EMAILS: "primary@example.com, second@example.com" },
      lookup,
    );

    expect(resolution.targets).toEqual([]);
    expect(resolution.skipped).toEqual(["primary@example.com", "second@example.com"]);
  });
});
