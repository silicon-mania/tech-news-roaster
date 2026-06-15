import { describe, expect, test } from "vitest";
import type { GenerationProviderId } from "@/services/generation";
import { createInMemoryRunRepository } from "./in-memory-run-repository";
import type { GenerationRun } from "./types";

function freshRepository(ownerId = "operator-1") {
  return createInMemoryRunRepository(ownerId, new Map());
}

describe("in-memory run repository", () => {
  test("saves a run, loads it back, and normalizes a missing origin to manual", async () => {
    const repository = freshRepository();

    await repository.save(buildRun({ id: "run-1" }));
    const loaded = await repository.loadById("run-1");

    expect(loaded?.id).toBe("run-1");
    expect(loaded?.origin).toBe("manual");
  });

  test("preserves an explicit automated origin", async () => {
    const repository = freshRepository();

    await repository.save(buildRun({ id: "run-1", origin: "automated" }));

    expect((await repository.loadById("run-1"))?.origin).toBe("automated");
  });

  test("returns null for an unknown run", async () => {
    expect(await freshRepository().loadById("missing")).toBeNull();
  });

  test("lists runs newest-saved first with no retention cap", async () => {
    const repository = freshRepository();

    for (let index = 1; index <= 12; index += 1) {
      await repository.save(buildRun({ id: `run-${index}`, savedAt: timestamp(index) }));
    }

    const runs = await repository.list();

    expect(runs).toHaveLength(12);
    expect(runs.at(0)?.id).toBe("run-12");
    expect(runs.at(-1)?.id).toBe("run-1");
  });

  test("paginates with a forward cursor", async () => {
    const repository = freshRepository();

    for (let index = 1; index <= 5; index += 1) {
      await repository.save(buildRun({ id: `run-${index}`, savedAt: timestamp(index) }));
    }

    const firstPage = await repository.listPaginated({ limit: 2 });

    expect(firstPage.runs.map((run) => run.id)).toEqual(["run-5", "run-4"]);
    expect(firstPage.nextCursor).toBe("2");

    const secondPage = await repository.listPaginated({ cursor: firstPage.nextCursor, limit: 2 });

    expect(secondPage.runs.map((run) => run.id)).toEqual(["run-3", "run-2"]);
    expect(secondPage.nextCursor).toBe("4");

    const lastPage = await repository.listPaginated({ cursor: secondPage.nextCursor, limit: 2 });

    expect(lastPage.runs.map((run) => run.id)).toEqual(["run-1"]);
    expect(lastPage.nextCursor).toBeNull();
  });

  test("marks a run seen", async () => {
    const repository = freshRepository();

    await repository.save(buildRun({ id: "run-1" }));
    expect((await repository.loadById("run-1"))?.seenAt).toBeUndefined();

    await repository.markSeen("run-1");

    expect((await repository.loadById("run-1"))?.seenAt).toEqual(expect.any(String));
  });

  test("deletes a run", async () => {
    const repository = freshRepository();

    await repository.save(buildRun({ id: "run-1" }));
    await repository.delete("run-1");

    expect(await repository.loadById("run-1")).toBeNull();
  });

  test("isolates runs by owner", async () => {
    const runsByOwner = new Map();
    const operatorOne = createInMemoryRunRepository("operator-1", runsByOwner);
    const operatorTwo = createInMemoryRunRepository("operator-2", runsByOwner);

    await operatorOne.save(buildRun({ id: "run-1" }));

    expect(await operatorTwo.loadById("run-1")).toBeNull();
    expect(await operatorTwo.list()).toEqual([]);
  });
});

function buildRun(overrides: Partial<GenerationRun> = {}): GenerationRun {
  return {
    id: "saved-run",
    label: "Saved run",
    sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
    usersDirection: "Keep it dry.",
    status: "completed",
    draftCount: 3,
    draftTarget: 3,
    drafts: [
      buildSavedDraft({ id: "draft-openai", provider: "openai" }),
      buildSavedDraft({ id: "draft-anthropic", provider: "anthropic" }),
      buildSavedDraft({ id: "draft-google", provider: "google" }),
    ],
    savedAt: timestamp(1),
    ...overrides,
  };
}

function buildSavedDraft({
  id,
  provider,
}: {
  id: string;
  provider: GenerationProviderId;
}): GenerationRun["drafts"][number] {
  return {
    angle: `${provider} angle`,
    id,
    modelProvenance: `${provider} local draft model`,
    provider,
    text: `Quote-tweet draft from ${provider}.`,
    visibleRationale: `${provider} rationale.`,
  };
}

function timestamp(day: number) {
  return new Date(Date.UTC(2026, 0, day)).toISOString();
}
