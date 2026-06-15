import { describe, expect, test } from "vitest";
import type { GenerationProviderId } from "@/services/generation";
import type { GenerationRun } from "@/services/saved-runs";
import { createInMemoryRunRepository } from "@/services/saved-runs/in-memory-run-repository";
import type { RunRepositoryResolution } from "@/services/saved-runs/run-repository";
import { deleteRunById, loadRunById } from "./[runId]/route";
import { markRunSeen } from "./[runId]/seen/route";
import { listRuns, saveRun } from "./route";

function ownedBy(repository = createInMemoryRunRepository("operator-1", new Map())) {
  return {
    repository,
    resolveRepository: async (): Promise<RunRepositoryResolution> => ({ repository }),
  };
}

const unauthorized = {
  resolveRepository: async (): Promise<RunRepositoryResolution> => ({ unauthorized: true }),
};

function postRunRequest(run: GenerationRun) {
  return new Request("https://app.test/api/runs", {
    body: JSON.stringify(run),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

function listRequest(query = "") {
  return new Request(`https://app.test/api/runs${query}`);
}

describe("runs route contract", () => {
  test("saves a run, loads it by id, lists it paginated, then marks it seen", async () => {
    const deps = ownedBy();

    const saved = await saveRun(postRunRequest(buildRun({ id: "run-1" })), deps);
    expect(saved.status).toBe(200);

    const loaded = await loadRunById("run-1", deps);
    expect(loaded.status).toBe(200);
    const loadedBody = (await loaded.json()) as { run: GenerationRun };
    expect(loadedBody.run.id).toBe("run-1");
    // Every persisted run carries an origin; a manual run defaults to "manual".
    expect(loadedBody.run.origin).toBe("manual");
    expect(loadedBody.run.seenAt).toBeUndefined();

    const page = await listRuns(listRequest("?limit=10"), deps);
    const pageBody = (await page.json()) as { nextCursor: string | null; runs: GenerationRun[] };
    expect(pageBody.runs.map((run) => run.id)).toEqual(["run-1"]);
    expect(pageBody.nextCursor).toBeNull();

    const seen = await markRunSeen("run-1", deps);
    expect(seen.status).toBe(200);
    const afterSeen = await loadRunById("run-1", deps);
    const afterSeenBody = (await afterSeen.json()) as { run: GenerationRun };
    expect(afterSeenBody.run.seenAt).toEqual(expect.any(String));
  });

  test("lists every run with no ten-run cap and pages forward", async () => {
    const deps = ownedBy();

    for (let index = 1; index <= 12; index += 1) {
      await saveRun(
        postRunRequest(buildRun({ id: `run-${index}`, savedAt: timestamp(index) })),
        deps,
      );
    }

    const fullList = await listRuns(listRequest(), deps);
    const fullBody = (await fullList.json()) as { runs: GenerationRun[] };
    expect(fullBody.runs).toHaveLength(12);

    const firstPage = await listRuns(listRequest("?limit=5"), deps);
    const firstBody = (await firstPage.json()) as {
      nextCursor: string | null;
      runs: GenerationRun[];
    };
    expect(firstBody.runs).toHaveLength(5);
    expect(firstBody.runs.at(0)?.id).toBe("run-12");
    expect(firstBody.nextCursor).toBe("5");

    const secondPage = await listRuns(listRequest(`?limit=5&cursor=${firstBody.nextCursor}`), deps);
    const secondBody = (await secondPage.json()) as { runs: GenerationRun[] };
    expect(secondBody.runs).toHaveLength(5);
  });

  test("deletes a run", async () => {
    const deps = ownedBy();

    await saveRun(postRunRequest(buildRun({ id: "run-1" })), deps);
    const deleted = await deleteRunById("run-1", deps);
    expect(deleted.status).toBe(200);

    expect((await loadRunById("run-1", deps)).status).toBe(404);
  });

  test("returns 404 for an unknown run", async () => {
    expect((await loadRunById("missing", ownedBy())).status).toBe(404);
  });

  test("rejects an invalid run body with 400", async () => {
    const response = await saveRun(
      postRunRequest({ id: "" } as unknown as GenerationRun),
      ownedBy(),
    );

    expect(response.status).toBe(400);
  });

  describe("ownership gate", () => {
    test("rejects listing when no operator is signed in", async () => {
      expect((await listRuns(listRequest(), unauthorized)).status).toBe(401);
    });

    test("rejects saving when no operator is signed in", async () => {
      const response = await saveRun(postRunRequest(buildRun({ id: "run-1" })), unauthorized);

      expect(response.status).toBe(401);
    });

    test("rejects load, delete, and mark-seen when no operator is signed in", async () => {
      expect((await loadRunById("run-1", unauthorized)).status).toBe(401);
      expect((await deleteRunById("run-1", unauthorized)).status).toBe(401);
      expect((await markRunSeen("run-1", unauthorized)).status).toBe(401);
    });

    test("scopes runs to the resolved operator", async () => {
      const runsByOwner = new Map();
      const operatorOne = {
        resolveRepository: async (): Promise<RunRepositoryResolution> => ({
          repository: createInMemoryRunRepository("operator-1", runsByOwner),
        }),
      };
      const operatorTwo = {
        resolveRepository: async (): Promise<RunRepositoryResolution> => ({
          repository: createInMemoryRunRepository("operator-2", runsByOwner),
        }),
      };

      await saveRun(postRunRequest(buildRun({ id: "run-1" })), operatorOne);

      expect((await loadRunById("run-1", operatorTwo)).status).toBe(404);
      const operatorTwoList = await listRuns(listRequest(), operatorTwo);
      expect(((await operatorTwoList.json()) as { runs: GenerationRun[] }).runs).toEqual([]);
    });
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
