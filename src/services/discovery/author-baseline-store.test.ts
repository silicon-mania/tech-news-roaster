import { describe, expect, test } from "vitest";
import type { OperatorSessionReader } from "@/services/saved-runs/run-repository";
import type { AuthorBaseline } from "./author-baseline";
import {
  type AuthorBaselineRepositoryResolution,
  createAuthorBaselineRepository,
  resolveAuthorBaselineRepository,
} from "./author-baseline-store";

const supabaseEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const baseline: AuthorBaseline = {
  authorUsername: "founder",
  baselineVelocity: 3,
  sampleSize: 5,
  computedAt: "2026-06-16T12:00:00.000Z",
};

const noSession: OperatorSessionReader = async () => null;
const signedInOperator: OperatorSessionReader = async () => ({ userId: "operator-1" });

describe("createAuthorBaselineRepository", () => {
  test("falls back to an in-memory repository when Supabase is unconfigured", async () => {
    const repository = createAuthorBaselineRepository("operator-1", {});

    await repository.save(baseline);
    expect(await repository.get("founder")).toEqual(baseline);
  });

  test("builds a Supabase-backed repository when configured", () => {
    const repository = createAuthorBaselineRepository("operator-1", supabaseEnv);

    expect(typeof repository.get).toBe("function");
    expect(typeof repository.save).toBe("function");
  });
});

describe("resolveAuthorBaselineRepository", () => {
  test("opens the gate with a local owner when Supabase is unconfigured", async () => {
    const resolution: AuthorBaselineRepositoryResolution = await resolveAuthorBaselineRepository(
      {},
      noSession,
    );

    expect("repository" in resolution).toBe(true);
  });

  test("rejects when Supabase is configured but no operator is signed in", async () => {
    const resolution = await resolveAuthorBaselineRepository(supabaseEnv, noSession);

    expect(resolution).toEqual({ unauthorized: true });
  });

  test("hands back a repository for the signed-in operator", async () => {
    const resolution = await resolveAuthorBaselineRepository(supabaseEnv, signedInOperator);

    expect("repository" in resolution).toBe(true);
  });
});
