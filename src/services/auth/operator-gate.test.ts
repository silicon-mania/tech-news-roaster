import { describe, expect, test } from "vitest";
import { resolveOperatorGate } from "./operator-gate";

describe("operator gate", () => {
  test("stays open everywhere when Supabase is unconfigured", () => {
    expect(resolveOperatorGate({ hasOperator: false, isConfigured: false, pathname: "/" })).toEqual(
      { type: "allow" },
    );
    expect(
      resolveOperatorGate({
        hasOperator: false,
        isConfigured: false,
        pathname: "/api/generation-runs/stream",
      }),
    ).toEqual({ type: "allow" });
  });

  test("redirects an unauthenticated page request to the sign-in surface", () => {
    expect(resolveOperatorGate({ hasOperator: false, isConfigured: true, pathname: "/" })).toEqual({
      location: "/sign-in",
      type: "redirect",
    });
  });

  test("rejects an unauthenticated runs API request with 401", () => {
    expect(
      resolveOperatorGate({
        hasOperator: false,
        isConfigured: true,
        pathname: "/api/generation-runs/stream",
      }),
    ).toEqual({ type: "unauthorized" });
  });

  test("lets the signed-in operator through to gated paths", () => {
    expect(resolveOperatorGate({ hasOperator: true, isConfigured: true, pathname: "/" })).toEqual({
      type: "allow",
    });
    expect(
      resolveOperatorGate({
        hasOperator: true,
        isConfigured: true,
        pathname: "/api/generation-runs/stream",
      }),
    ).toEqual({ type: "allow" });
  });

  test("leaves the sign-in surface and auth API public for unauthenticated visitors", () => {
    for (const pathname of [
      "/sign-in",
      "/api/auth/request-code",
      "/api/auth/verify-code",
      "/enrich",
    ]) {
      expect(resolveOperatorGate({ hasOperator: false, isConfigured: true, pathname })).toEqual({
        type: "allow",
      });
    }
  });

  test("leaves the bearer-authenticated discovery-sweep route public to the session gate", () => {
    // The unattended Vercel Cron request carries no operator session — it
    // authenticates with CRON_SECRET inside the route — so the session gate must
    // not 401 it first.
    expect(
      resolveOperatorGate({
        hasOperator: false,
        isConfigured: true,
        pathname: "/api/discovery-sweep",
      }),
    ).toEqual({ type: "allow" });
  });
});
