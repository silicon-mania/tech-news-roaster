import { describe, expect, test } from "vitest";
import type { OperatorSessionReader } from "@/services/saved-runs/run-repository";
import type { NewsCoverageCluster } from "./news-coverage-cluster";
import {
  createNewsCoverageClusterRepository,
  type NewsCoverageClusterRepositoryResolution,
  resolveNewsCoverageClusterRepository,
} from "./news-coverage-cluster-store";

const supabaseEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const cluster: NewsCoverageCluster = {
  id: "cluster-1",
  sourceTweetId: "tweet-1",
  sourceText: "OpenAI ships an agent workspace.",
  memberTweetIds: ["tweet-1"],
  earliestCreatedAt: "2026-06-05T10:00:00.000Z",
  runId: null,
  createdAt: "2026-06-05T10:05:00.000Z",
  updatedAt: "2026-06-05T10:05:00.000Z",
};

const noSession: OperatorSessionReader = async () => null;
const signedInOperator: OperatorSessionReader = async () => ({ userId: "operator-1" });

describe("createNewsCoverageClusterRepository", () => {
  test("falls back to an in-memory repository when Supabase is unconfigured", async () => {
    const repository = createNewsCoverageClusterRepository("operator-1", {});

    await repository.save(cluster);
    expect(await repository.loadById("cluster-1")).toEqual(cluster);
  });

  test("builds a Supabase-backed repository when configured", () => {
    const repository = createNewsCoverageClusterRepository("operator-1", supabaseEnv);

    expect(typeof repository.listRecent).toBe("function");
    expect(typeof repository.save).toBe("function");
  });
});

describe("resolveNewsCoverageClusterRepository", () => {
  test("opens the gate with a local owner when Supabase is unconfigured", async () => {
    const resolution: NewsCoverageClusterRepositoryResolution =
      await resolveNewsCoverageClusterRepository({}, noSession);

    expect("repository" in resolution).toBe(true);
  });

  test("rejects when Supabase is configured but no operator is signed in", async () => {
    const resolution = await resolveNewsCoverageClusterRepository(supabaseEnv, noSession);

    expect(resolution).toEqual({ unauthorized: true });
  });

  test("hands back a repository for the signed-in operator", async () => {
    const resolution = await resolveNewsCoverageClusterRepository(supabaseEnv, signedInOperator);

    expect("repository" in resolution).toBe(true);
  });
});
