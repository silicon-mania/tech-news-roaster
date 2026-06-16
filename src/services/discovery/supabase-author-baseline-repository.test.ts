import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, test } from "vitest";
import type { AuthorBaseline } from "./author-baseline";
import { createSupabaseAuthorBaselineRepository } from "./supabase-author-baseline-repository";

const computedAt = "2026-06-16T12:00:00.000Z";

const storedBaseline: AuthorBaseline = {
  authorUsername: "founder",
  baselineVelocity: 3.5,
  sampleSize: 7,
  computedAt,
};

type MaybeSingleResult = { data: { payload: unknown } | null; error: { message: string } | null };

function fakeClient(getResult: MaybeSingleResult) {
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
        async maybeSingle() {
          return getResult;
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

describe("createSupabaseAuthorBaselineRepository", () => {
  test("reads and parses the stored payload, scoped to owner and author", async () => {
    const { client, filters } = fakeClient({ data: { payload: storedBaseline }, error: null });
    const repository = createSupabaseAuthorBaselineRepository("operator-1", client);

    expect(await repository.get("founder")).toEqual(storedBaseline);
    expect(filters).toEqual({ owner_id: "operator-1", author_username: "founder" });
  });

  test("returns null when the author has no stored baseline", async () => {
    const { client } = fakeClient({ data: null, error: null });
    const repository = createSupabaseAuthorBaselineRepository("operator-1", client);

    expect(await repository.get("ghost")).toBeNull();
  });

  test("throws when the read fails", async () => {
    const { client } = fakeClient({ data: null, error: { message: "boom" } });
    const repository = createSupabaseAuthorBaselineRepository("operator-1", client);

    await expect(repository.get("founder")).rejects.toThrow("boom");
  });

  test("upserts the full baseline plus mirrored columns on the owner+author key", async () => {
    const { client, upserts } = fakeClient({ data: null, error: null });
    const repository = createSupabaseAuthorBaselineRepository("operator-1", client);

    await repository.save(storedBaseline);

    expect(upserts).toHaveLength(1);
    expect(upserts[0].row).toMatchObject({
      owner_id: "operator-1",
      author_username: "founder",
      baseline_velocity: 3.5,
      sample_size: 7,
      computed_at: computedAt,
      payload: storedBaseline,
    });
    expect(upserts[0].options).toEqual({ onConflict: "owner_id,author_username" });
  });
});
