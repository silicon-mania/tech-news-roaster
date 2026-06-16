import { describe, expect, test } from "vitest";
import { createInMemoryNewsCoverageClusterRepository } from "./in-memory-news-coverage-cluster-repository";
import type { NewsCoverageCluster } from "./news-coverage-cluster";

function cluster(overrides: Partial<NewsCoverageCluster> & { id: string }): NewsCoverageCluster {
  return {
    sourceTweetId: "tweet-1",
    sourceText: "OpenAI ships an agent workspace.",
    memberTweetIds: ["tweet-1"],
    earliestCreatedAt: "2026-06-05T10:00:00.000Z",
    runId: null,
    createdAt: "2026-06-05T10:05:00.000Z",
    updatedAt: "2026-06-05T10:05:00.000Z",
    ...overrides,
  };
}

describe("createInMemoryNewsCoverageClusterRepository", () => {
  test("saves and loads a cluster by id", async () => {
    const repository = createInMemoryNewsCoverageClusterRepository("operator-1", new Map());
    const saved = cluster({ id: "cluster-1" });

    await repository.save(saved);

    expect(await repository.loadById("cluster-1")).toEqual(saved);
    expect(await repository.loadById("missing")).toBeNull();
  });

  test("save upserts the run link on the same id", async () => {
    const repository = createInMemoryNewsCoverageClusterRepository("operator-1", new Map());

    await repository.save(cluster({ id: "cluster-1", runId: null }));
    await repository.save(cluster({ id: "cluster-1", runId: "run-7" }));

    expect(await repository.loadById("cluster-1")).toMatchObject({ runId: "run-7" });
  });

  test("listRecent returns only clusters within the window, oldest first", async () => {
    const repository = createInMemoryNewsCoverageClusterRepository("operator-1", new Map());

    await repository.save(cluster({ id: "stale", earliestCreatedAt: "2026-06-05T06:00:00.000Z" }));
    await repository.save(cluster({ id: "recent", earliestCreatedAt: "2026-06-05T11:00:00.000Z" }));
    await repository.save(cluster({ id: "edge", earliestCreatedAt: "2026-06-05T09:00:00.000Z" }));

    const recent = await repository.listRecent("2026-06-05T09:00:00.000Z");

    expect(recent.map((entry) => entry.id)).toEqual(["edge", "recent"]);
  });

  test("scopes clusters to their owner", async () => {
    const clustersByOwner = new Map();
    const operatorOne = createInMemoryNewsCoverageClusterRepository("operator-1", clustersByOwner);
    const operatorTwo = createInMemoryNewsCoverageClusterRepository("operator-2", clustersByOwner);

    await operatorOne.save(cluster({ id: "cluster-1" }));

    expect(await operatorTwo.loadById("cluster-1")).toBeNull();
  });
});
