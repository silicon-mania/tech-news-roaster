import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import { createSupabaseSeenTweetRepository } from "./supabase-seen-tweet-repository";

type InResult = { data: { tweet_id: string }[] | null; error: { message: string } | null };

function fakeClient(inResult: InResult) {
  const filters: Record<string, unknown> = {};
  const upserts: { rows: Record<string, unknown>[]; options: unknown }[] = [];
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
        in(column: string, value: unknown) {
          filters[`in:${column}`] = value;
          return Promise.resolve(inResult);
        },
        upsert(rows: Record<string, unknown>[], options: unknown) {
          upserts.push({ rows, options });
          return Promise.resolve({ error: null });
        },
      };

      return builder;
    },
  };

  return { client: client as unknown as SupabaseClient, filters, upserts };
}

describe("createSupabaseSeenTweetRepository", () => {
  test("returns the ids not already recorded, scoped to owner", async () => {
    const { client, filters } = fakeClient({ data: [{ tweet_id: "a" }], error: null });
    const repository = createSupabaseSeenTweetRepository("operator-1", client);

    expect(await repository.filterUnseen(["a", "b", "c"])).toEqual(["b", "c"]);
    expect(filters).toEqual({ owner_id: "operator-1", "in:tweet_id": ["a", "b", "c"] });
  });

  test("short-circuits an empty id list without touching the client", async () => {
    const { client, filters } = fakeClient({ data: null, error: { message: "should not run" } });
    const repository = createSupabaseSeenTweetRepository("operator-1", client);

    expect(await repository.filterUnseen([])).toEqual([]);
    expect(filters).toEqual({});
  });

  test("throws when the read fails", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });
    const repository = createSupabaseSeenTweetRepository("operator-1", client);

    await expect(repository.filterUnseen(["a"])).rejects.toThrow("boom");
  });

  test("upserts one row per id on the owner+tweet key", async () => {
    const { client, upserts } = fakeClient({ data: [], error: null });
    const repository = createSupabaseSeenTweetRepository("operator-1", client);

    await repository.markSeen(["a", "b"]);

    expect(upserts).toHaveLength(1);
    expect(upserts[0].rows).toHaveLength(2);
    expect(upserts[0].rows[0]).toMatchObject({ owner_id: "operator-1", tweet_id: "a" });
    expect(upserts[0].options).toEqual({ onConflict: "owner_id,tweet_id" });
  });

  test("skips the upsert when there is nothing to record", async () => {
    const { client, upserts } = fakeClient({ data: [], error: null });
    const repository = createSupabaseSeenTweetRepository("operator-1", client);

    await repository.markSeen([]);

    expect(upserts).toEqual([]);
  });
});
