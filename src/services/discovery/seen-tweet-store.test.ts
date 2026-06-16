import { describe, expect, test } from "vitest";
import type { OperatorSessionReader } from "@/services/saved-runs/run-repository";
import {
  createSeenTweetRepository,
  resolveSeenTweetRepository,
  type SeenTweetRepositoryResolution,
} from "./seen-tweet-store";

const supabaseEnv = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "anon-key",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
};

const noSession: OperatorSessionReader = async () => null;
const signedInOperator: OperatorSessionReader = async () => ({ userId: "operator-1" });

describe("createSeenTweetRepository", () => {
  test("falls back to an in-memory record when Supabase is unconfigured", async () => {
    const repository = createSeenTweetRepository("operator-1", {});

    await repository.markSeen(["a"]);
    expect(await repository.filterUnseen(["a", "b"])).toEqual(["b"]);
  });

  test("builds a Supabase-backed record when configured", () => {
    const repository = createSeenTweetRepository("operator-1", supabaseEnv);

    expect(typeof repository.filterUnseen).toBe("function");
    expect(typeof repository.markSeen).toBe("function");
  });
});

describe("resolveSeenTweetRepository", () => {
  test("opens the gate with a local owner when Supabase is unconfigured", async () => {
    const resolution: SeenTweetRepositoryResolution = await resolveSeenTweetRepository(
      {},
      noSession,
    );

    expect("repository" in resolution).toBe(true);
  });

  test("rejects when Supabase is configured but no operator is signed in", async () => {
    const resolution = await resolveSeenTweetRepository(supabaseEnv, noSession);

    expect(resolution).toEqual({ unauthorized: true });
  });

  test("hands back a record for the signed-in operator", async () => {
    const resolution = await resolveSeenTweetRepository(supabaseEnv, signedInOperator);

    expect("repository" in resolution).toBe(true);
  });
});
