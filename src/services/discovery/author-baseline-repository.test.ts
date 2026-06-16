import { describe, expect, test } from "vitest";
import {
  type AuthorBaseline,
  type AuthorBaselineRepository,
  createInMemoryAuthorBaselineRepository,
} from "@/services/discovery";

const nowMs = Date.parse("2026-06-16T12:00:00.000Z");

function baseline(authorUsername: string): AuthorBaseline {
  return {
    authorUsername,
    baselineVelocity: 3,
    sampleSize: 5,
    computedAt: new Date(nowMs).toISOString(),
  };
}

describe("createInMemoryAuthorBaselineRepository", () => {
  test("round-trips a saved baseline by author", async () => {
    const repository: AuthorBaselineRepository = createInMemoryAuthorBaselineRepository(
      "operator-1",
      new Map(),
    );

    expect(await repository.get("founder")).toBeNull();
    await repository.save(baseline("founder"));
    expect(await repository.get("founder")).toEqual(baseline("founder"));
  });

  test("overwrites an author's baseline on resave", async () => {
    const repository = createInMemoryAuthorBaselineRepository("operator-1", new Map());

    await repository.save(baseline("founder"));
    await repository.save({ ...baseline("founder"), baselineVelocity: 9 });

    expect((await repository.get("founder"))?.baselineVelocity).toBe(9);
  });

  test("isolates baselines per owner even when the backing map is shared", async () => {
    const baselinesByOwner = new Map();
    const ownerOne = createInMemoryAuthorBaselineRepository("operator-1", baselinesByOwner);
    const ownerTwo = createInMemoryAuthorBaselineRepository("operator-2", baselinesByOwner);

    await ownerOne.save(baseline("founder"));

    expect(await ownerTwo.get("founder")).toBeNull();
  });
});
