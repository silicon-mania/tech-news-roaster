import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import type { NewsCoverageCluster } from "./news-coverage-cluster";
import { createSupabaseNewsCoverageClusterRepository } from "./supabase-news-coverage-cluster-repository";

const storedCluster: NewsCoverageCluster = {
  id: "cluster-1",
  sourceTweetId: "tweet-1",
  sourceText: "OpenAI ships an agent workspace.",
  memberTweetIds: ["tweet-1", "tweet-2"],
  earliestCreatedAt: "2026-06-05T10:00:00.000Z",
  runId: "run-7",
  createdAt: "2026-06-05T10:05:00.000Z",
  updatedAt: "2026-06-05T10:05:00.000Z",
};

type Rows = { payload: unknown }[];
type ListResult = { data: Rows | null; error: { message: string } | null };
type SingleResult = { data: { payload: unknown } | null; error: { message: string } | null };

function fakeClient(results: { list?: ListResult; single?: SingleResult }) {
  const filters: Record<string, unknown> = {};
  const upserts: { row: Record<string, unknown>; options: unknown }[] = [];
  const client = {
    from() {
      const builder = {
        select() {
          return builder;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return builder;
        },
        gte(column: string, value: unknown) {
          filters[`gte:${column}`] = value;
          return builder;
        },
        order() {
          return Promise.resolve(results.list ?? { data: [], error: null });
        },
        async maybeSingle() {
          return results.single ?? { data: null, error: null };
        },
        upsert(row: Record<string, unknown>, options: unknown) {
          upserts.push({ row, options });
          return Promise.resolve({ error: null });
        },
      };

      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient, filters, upserts };
}

describe("createSupabaseNewsCoverageClusterRepository", () => {
  test("lists recent clusters scoped to owner and window", async () => {
    const { client, filters } = fakeClient({
      list: { data: [{ payload: storedCluster }], error: null },
    });
    const repository = createSupabaseNewsCoverageClusterRepository("operator-1", client);

    expect(await repository.listRecent("2026-06-05T09:00:00.000Z")).toEqual([storedCluster]);
    expect(filters).toEqual({
      owner_id: "operator-1",
      "gte:earliest_created_at": "2026-06-05T09:00:00.000Z",
    });
  });

  test("loads a cluster by id scoped to owner", async () => {
    const { client, filters } = fakeClient({
      single: { data: { payload: storedCluster }, error: null },
    });
    const repository = createSupabaseNewsCoverageClusterRepository("operator-1", client);

    expect(await repository.loadById("cluster-1")).toEqual(storedCluster);
    expect(filters).toEqual({ owner_id: "operator-1", id: "cluster-1" });
  });

  test("returns null when the cluster is absent", async () => {
    const { client } = fakeClient({ single: { data: null, error: null } });
    const repository = createSupabaseNewsCoverageClusterRepository("operator-1", client);

    expect(await repository.loadById("ghost")).toBeNull();
  });

  test("throws when a read fails", async () => {
    const { client } = fakeClient({ list: { data: null, error: { message: "boom" } } });
    const repository = createSupabaseNewsCoverageClusterRepository("operator-1", client);

    await expect(repository.listRecent("2026-06-05T09:00:00.000Z")).rejects.toThrow("boom");
  });

  test("upserts the full cluster plus mirrored columns on the owner+id key", async () => {
    const { client, upserts } = fakeClient({});
    const repository = createSupabaseNewsCoverageClusterRepository("operator-1", client);

    await repository.save(storedCluster);

    expect(upserts).toHaveLength(1);
    expect(upserts[0].row).toMatchObject({
      owner_id: "operator-1",
      id: "cluster-1",
      source_tweet_id: "tweet-1",
      earliest_created_at: "2026-06-05T10:00:00.000Z",
      run_id: "run-7",
      payload: storedCluster,
    });
    expect(upserts[0].options).toEqual({ onConflict: "owner_id,id" });
  });
});
