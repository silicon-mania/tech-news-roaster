import { Buffer } from "node:buffer";
import { describe, expect, test } from "vitest";
import { parseImageSet, type SavedGenerationRun } from "@/services/generation";
import { buildImageSet } from "@/services/generation/test-fixtures";
import { type FanOutTarget, fanOutAutomatedRun } from "./fan-out-automated-run";
import {
  createInMemoryImageBytesStore,
  imageStoragePath,
  type StoredImageBytes,
} from "./image-bytes-store";
import type { RunRepository } from "./types";

const anchorOwnerId = "user-primary";
const operatorA: FanOutTarget = { email: "a@example.com", userId: "user-a" };
const operatorB: FanOutTarget = { email: "b@example.com", userId: "user-b" };
const anchorTarget: FanOutTarget = { email: "primary@example.com", userId: anchorOwnerId };

function buildRun(overrides: Partial<SavedGenerationRun> = {}): SavedGenerationRun {
  return {
    id: "run-1",
    label: "Automated run for 12345",
    origin: "automated",
    imageSet: parseImageSet(buildImageSet()),
    ...overrides,
  } as unknown as SavedGenerationRun;
}

/** Owner-scoped fake run repositories backed by one shared per-owner map, so a test can
 *  assert each operator received its own independent copy. Avoids the real repository's
 *  schema normalization — fan-out only ever calls `save`. */
function createFakeRepositories() {
  const runsByOwner = new Map<string, Map<string, SavedGenerationRun>>();

  function ownerRuns(ownerId: string): Map<string, SavedGenerationRun> {
    const existing = runsByOwner.get(ownerId);

    if (existing) {
      return existing;
    }

    const created = new Map<string, SavedGenerationRun>();
    runsByOwner.set(ownerId, created);

    return created;
  }

  const create = (ownerId: string): RunRepository => ({
    async list() {
      return [...ownerRuns(ownerId).values()];
    },
    async listPaginated() {
      return { nextCursor: null, runs: [...ownerRuns(ownerId).values()] };
    },
    async loadById(runId) {
      return ownerRuns(ownerId).get(runId) ?? null;
    },
    async save(run) {
      // Store a shallow copy so each operator's edits stay independent, mirroring the
      // real stores (the in-memory repo re-parses; Supabase serializes to its own row).
      ownerRuns(ownerId).set(run.id, { ...run });
    },
    async delete(runId) {
      ownerRuns(ownerId).delete(runId);
    },
    async markSeen(runId) {
      const run = ownerRuns(ownerId).get(runId);

      if (run) {
        ownerRuns(ownerId).set(runId, { ...run, seenAt: "2026-06-19T00:00:00.000Z" });
      }
    },
  });

  return { create, ownerRuns };
}

async function seedAnchorBytes(
  bytesByOwner: Map<string, Map<string, StoredImageBytes>>,
  run: SavedGenerationRun,
) {
  const anchorStore = createInMemoryImageBytesStore(anchorOwnerId, bytesByOwner);

  for (const option of run.imageSet?.options ?? []) {
    await anchorStore.put(
      imageStoragePath(run.id, option.id),
      Buffer.from(`bytes:${option.id}`),
      "image/png",
    );
  }
}

describe("fanOutAutomatedRun", () => {
  test("copies the run to every non-anchor operator with the same id, payload, and image bytes", async () => {
    const run = buildRun();
    const repos = createFakeRepositories();
    const bytesByOwner = new Map<string, Map<string, StoredImageBytes>>();
    await seedAnchorBytes(bytesByOwner, run);

    const outcomes = await fanOutAutomatedRun(
      { run, anchorOwnerId, targets: [anchorTarget, operatorA, operatorB] },
      {
        createRunRepository: repos.create,
        createImageBytesStore: (ownerId) => createInMemoryImageBytesStore(ownerId, bytesByOwner),
      },
    );

    // One copy per signed-in operator other than the anchor; the anchor is filtered out.
    expect(outcomes).toEqual([
      { email: operatorA.email, userId: operatorA.userId, status: "copied" },
      { email: operatorB.email, userId: operatorB.userId, status: "copied" },
    ]);

    for (const operator of [operatorA, operatorB]) {
      // Same run id, verbatim payload.
      const copy = await repos.create(operator.userId).loadById(run.id);
      expect(copy).toEqual(run);

      // The Selected Image Original plus its four variations were copied byte-for-byte
      // into this operator's storage prefix.
      const targetStore = createInMemoryImageBytesStore(operator.userId, bytesByOwner);
      for (const option of run.imageSet?.options ?? []) {
        const stored = await targetStore.get(imageStoragePath(run.id, option.id));
        expect(stored?.bytes.toString()).toBe(`bytes:${option.id}`);
        expect(stored?.contentType).toBe("image/png");
      }
    }
  });

  test("never copies a run onto the anchor itself", async () => {
    const run = buildRun();
    const repos = createFakeRepositories();
    const bytesByOwner = new Map<string, Map<string, StoredImageBytes>>();
    await seedAnchorBytes(bytesByOwner, run);

    const outcomes = await fanOutAutomatedRun(
      { run, anchorOwnerId, targets: [anchorTarget] },
      {
        createRunRepository: repos.create,
        createImageBytesStore: (ownerId) => createInMemoryImageBytesStore(ownerId, bytesByOwner),
      },
    );

    expect(outcomes).toEqual([]);
    // The fan-out never wrote to the anchor's repository — it holds the composed original.
    expect(await repos.create(anchorOwnerId).list()).toEqual([]);
  });

  test("leaves each copy unseen so the run appears as new in its operator's feed", async () => {
    const run = buildRun({ seenAt: undefined });
    const repos = createFakeRepositories();
    const bytesByOwner = new Map<string, Map<string, StoredImageBytes>>();
    await seedAnchorBytes(bytesByOwner, run);

    await fanOutAutomatedRun(
      { run, anchorOwnerId, targets: [operatorA] },
      {
        createRunRepository: repos.create,
        createImageBytesStore: (ownerId) => createInMemoryImageBytesStore(ownerId, bytesByOwner),
      },
    );

    const copy = await repos.create(operatorA.userId).loadById(run.id);
    expect(copy?.seenAt).toBeUndefined();
  });

  test("copies are independent: editing or deleting one operator's copy does not affect another's", async () => {
    const run = buildRun();
    const repos = createFakeRepositories();
    const bytesByOwner = new Map<string, Map<string, StoredImageBytes>>();
    await seedAnchorBytes(bytesByOwner, run);

    await fanOutAutomatedRun(
      { run, anchorOwnerId, targets: [operatorA, operatorB] },
      {
        createRunRepository: repos.create,
        createImageBytesStore: (ownerId) => createInMemoryImageBytesStore(ownerId, bytesByOwner),
      },
    );

    // Operator A edits their copy; Operator B deletes theirs.
    await repos.create(operatorA.userId).save({ ...run, label: "Edited by A" });
    await repos.create(operatorB.userId).delete(run.id);

    // A different operator (kept here as a third copy target) is unaffected by both.
    const reposC = repos.create("user-c");
    await reposC.save(run);

    expect((await repos.create(operatorA.userId).loadById(run.id))?.label).toBe("Edited by A");
    expect(await repos.create(operatorB.userId).loadById(run.id)).toBeNull();
    expect((await reposC.loadById(run.id))?.label).toBe(run.label);
  });

  test("is best-effort per operator: one failed copy is isolated and does not block the others", async () => {
    const run = buildRun();
    const repos = createFakeRepositories();
    const bytesByOwner = new Map<string, Map<string, StoredImageBytes>>();
    await seedAnchorBytes(bytesByOwner, run);

    const outcomes = await fanOutAutomatedRun(
      { run, anchorOwnerId, targets: [operatorA, operatorB] },
      {
        createRunRepository: repos.create,
        // Operator B's storage is down; Operator A's is healthy.
        createImageBytesStore: (ownerId) =>
          ownerId === operatorB.userId
            ? {
                async get() {
                  return null;
                },
                async put() {
                  throw new Error("storage down");
                },
              }
            : createInMemoryImageBytesStore(ownerId, bytesByOwner),
      },
    );

    expect(outcomes).toEqual([
      { email: operatorA.email, userId: operatorA.userId, status: "copied" },
      { email: operatorB.email, userId: operatorB.userId, status: "failed", error: "storage down" },
    ]);

    // Operator A still received a complete copy; Operator B received nothing (no retry).
    expect(await repos.create(operatorA.userId).loadById(run.id)).toEqual(run);
    expect(await repos.create(operatorB.userId).loadById(run.id)).toBeNull();
  });

  test("fails a copy when the anchor is missing an option's bytes (no half-written copy survives)", async () => {
    const run = buildRun();
    const repos = createFakeRepositories();
    // Anchor storage is empty — its bytes were never seeded.
    const bytesByOwner = new Map<string, Map<string, StoredImageBytes>>();

    const outcomes = await fanOutAutomatedRun(
      { run, anchorOwnerId, targets: [operatorA] },
      {
        createRunRepository: repos.create,
        createImageBytesStore: (ownerId) => createInMemoryImageBytesStore(ownerId, bytesByOwner),
      },
    );

    expect(outcomes[0].status).toBe("failed");
    // The payload is not saved when its bytes could not be copied first.
    expect(await repos.create(operatorA.userId).loadById(run.id)).toBeNull();
  });

  test("copies a run with no Image Set as payload-only", async () => {
    const run = buildRun({ imageSet: undefined });
    const repos = createFakeRepositories();
    const bytesByOwner = new Map<string, Map<string, StoredImageBytes>>();

    const outcomes = await fanOutAutomatedRun(
      { run, anchorOwnerId, targets: [operatorA] },
      {
        createRunRepository: repos.create,
        createImageBytesStore: (ownerId) => createInMemoryImageBytesStore(ownerId, bytesByOwner),
      },
    );

    expect(outcomes).toEqual([
      { email: operatorA.email, userId: operatorA.userId, status: "copied" },
    ]);
    expect(await repos.create(operatorA.userId).loadById(run.id)).toEqual(run);
  });
});
