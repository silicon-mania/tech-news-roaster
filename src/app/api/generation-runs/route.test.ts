import { describe, expect, test, vi } from "vitest";
import {
  parseCompletedGenerationRunPayload,
  parseJokeContextSnapshot,
} from "@/services/generation";
import { buildJokeContextSnapshot } from "@/services/generation/test-fixtures";
import {
  type ComposeManualRunDependencies,
  composeManualRun,
} from "@/services/manual-run/compose-manual-run";
import type { NewsCategoryClassificationResult } from "@/services/news-category-classifier";
import type { GenerationRun } from "@/services/saved-runs";
import { createInMemoryRunRepository } from "@/services/saved-runs/in-memory-run-repository";
import { buildFixtureTweetContext, TweetRetrievalError } from "@/services/tweet-retrieval";
import { createGenerationRun } from "./route";

const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
const usersDirection = "lean cynical";
const runId = "run-manual-route-test";
const fixedNow = () => new Date("2026-06-16T12:00:00.000Z");

const jokeContextSnapshot = parseJokeContextSnapshot(buildJokeContextSnapshot());

function buildClassificationResult(): NewsCategoryClassificationResult {
  return {
    classification: {
      completedAt: "2026-06-16T12:00:01.000Z",
      startedAt: "2026-06-16T12:00:00.000Z",
      status: "completed",
    },
    newsCategory: "ACQUIRED",
  };
}

function buildCompletedPayload() {
  const sourceTweet = buildFixtureTweetContext(sourceTweetUrl).sourceTweet;

  return parseCompletedGenerationRunPayload({
    label: "Manual drafts",
    sourceTweet,
    drafts: [
      {
        id: "draft-openai",
        angle: "platform leverage",
        text: "First manual draft.",
        modelProvenance: "local draft model",
        provider: "openai",
        visibleRationale: "Leads on platform leverage.",
      },
      {
        id: "draft-anthropic",
        angle: "incentive shift",
        text: "Second manual draft.",
        modelProvenance: "local draft model",
        provider: "anthropic",
        visibleRationale: "Leans on incentives.",
      },
      {
        id: "draft-google",
        angle: "distribution bet",
        text: "Third manual draft.",
        modelProvenance: "local draft model",
        provider: "google",
        visibleRationale: "Treats it as a distribution bet.",
      },
    ],
    generationResultStates: {
      contextGathering: {
        status: "completed",
        startedAt: "2026-06-06T10:08:00.000Z",
        completedAt: "2026-06-06T10:10:00.000Z",
        jokeContextSnapshot,
      },
      textGeneration: {
        status: "completed",
        startedAt: "2026-06-06T10:10:01.000Z",
        completedAt: "2026-06-06T10:10:30.000Z",
        draftCount: 3,
      },
      newsLinkedImageDiscovery: { status: "not-started" },
      imageGeneration: { status: "not-started" },
    },
  });
}

/**
 * Wires the route's `compose` seam to the real {@link composeManualRun} backed by
 * an in-memory repository and the standard DI fakes, so the route is exercised
 * end-to-end (a composed run is actually persisted under the operator) without a
 * backend or the network — the route-test analog of the runs-route's in-memory repo.
 */
function buildRealCompose(overrides: Partial<ComposeManualRunDependencies> = {}) {
  const repository = createInMemoryRunRepository("operator-1", new Map());
  const deps: ComposeManualRunDependencies = {
    retrieveTweetContext: async ({ sourceTweetUrl: requestedUrl }) =>
      buildFixtureTweetContext(requestedUrl),
    gatherJokeContext: async () => jokeContextSnapshot,
    discoverNewsLinkedImages: async () => ({
      discoveredAt: "2026-06-05T10:20:00.000Z",
      newsLinkedImages: [],
    }),
    orchestrateGeneration: async () => buildCompletedPayload(),
    classifyNewsCategory: async () => buildClassificationResult(),
    resolveRepository: async () => ({ repository }),
    now: fixedNow,
    ...overrides,
  };
  const compose: typeof composeManualRun = (input) => composeManualRun(input, deps);

  return { compose, repository };
}

function postRequest(body: unknown) {
  return new Request("https://app.test/api/generation-runs", {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
}

describe("POST /api/generation-runs", () => {
  test("composes a Manual Run and returns it persisted under the operator", async () => {
    const { compose, repository } = buildRealCompose();

    const response = await createGenerationRun(
      postRequest({ runId, sourceTweetUrl, usersDirection }),
      { compose },
    );

    expect(response.status).toBe(200);
    const { run } = (await response.json()) as { run: GenerationRun };
    expect(run.id).toBe(runId);
    expect(run.origin).toBe("manual");
    expect(run.imagePromptSource).toBe("user");
    expect(run.usersDirection).toBe(usersDirection);
    expect(run.status).toBe("completed");

    // It is owned by the caller: the run the route returned is the one persisted.
    expect(await repository.loadById(runId)).toEqual(run);
  });

  test("returns a persisted failed run with 200 so the workspace can show it", async () => {
    const { compose, repository } = buildRealCompose({
      retrieveTweetContext: async () => {
        throw new TweetRetrievalError();
      },
    });

    const response = await createGenerationRun(
      postRequest({ runId, sourceTweetUrl, usersDirection }),
      { compose },
    );

    // A failed composition is still a successful request: persisted and returned 200.
    expect(response.status).toBe(200);
    const { run } = (await response.json()) as { run: GenerationRun };
    expect(run.status).toBe("failed");
    expect(run.failureMessage).toBe("Source tweet could not be retrieved.");
    expect(await repository.loadById(runId)).toEqual(run);
  });

  test("mints a run id server-side when the body omits one", async () => {
    const { compose, repository } = buildRealCompose({ createRunId: () => "run-server-minted" });

    const response = await createGenerationRun(postRequest({ sourceTweetUrl }), { compose });

    expect(response.status).toBe(200);
    const { run } = (await response.json()) as { run: GenerationRun };
    expect(run.id).toBe("run-server-minted");
    expect(run.usersDirection).toBe("");
    expect(await repository.loadById("run-server-minted")).toEqual(run);
  });

  describe("authorization gate", () => {
    test("returns 401 when no operator can be resolved", async () => {
      const compose = vi.fn(async () => ({ unauthorized: true }) as const);

      const response = await createGenerationRun(
        postRequest({ runId, sourceTweetUrl, usersDirection }),
        { compose },
      );

      expect(response.status).toBe(401);
      expect((await response.json()) as { error: string }).toEqual({
        error: "Operator authentication required.",
      });
    });
  });

  describe("URL validation", () => {
    test("returns 400 and composes nothing when the source tweet URL is missing", async () => {
      const compose = vi.fn();

      const response = await createGenerationRun(postRequest({ usersDirection }), { compose });

      expect(response.status).toBe(400);
      expect(compose).not.toHaveBeenCalled();
    });

    test("returns 400 and composes nothing for a non-status URL", async () => {
      const compose = vi.fn();

      const response = await createGenerationRun(
        postRequest({ sourceTweetUrl: "https://example.com/not-a-tweet" }),
        { compose },
      );

      expect(response.status).toBe(400);
      expect(compose).not.toHaveBeenCalled();
    });

    test("returns 400 for a non-JSON body", async () => {
      const compose = vi.fn();
      const request = new Request("https://app.test/api/generation-runs", {
        body: "not json {",
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      const response = await createGenerationRun(request, { compose });

      expect(response.status).toBe(400);
      expect(compose).not.toHaveBeenCalled();
    });
  });
});
