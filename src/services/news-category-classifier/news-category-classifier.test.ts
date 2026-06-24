import { describe, expect, test, vi } from "vitest";
import {
  type JokeContextSnapshot,
  newsCategories,
  newsCategoryClassificationStateSchema,
  parseJokeContextSnapshot,
} from "@/services/generation";
import { buildJokeContextSnapshot } from "@/services/generation/test-fixtures";
import {
  classifyNewsCategory,
  createDefaultNewsCategoryClassifier,
  createLocalNewsCategoryClassifier,
  type NewsCategoryClassificationResult,
  type NewsCategoryClassifier,
  type NewsCategoryClassifierInput,
  newsCategoryClassifierInstruction,
} from "@/services/news-category-classifier";

const now = () => new Date("2026-06-23T12:00:00.000Z");

describe("classifyNewsCategory", () => {
  test("yields the classifier's pick and a completed state on the happy path", async () => {
    const input: NewsCategoryClassifierInput = { jokeContextSnapshot: buildSnapshot() };

    const result: NewsCategoryClassificationResult = await classifyNewsCategory(input, {
      classifier: stubClassifier("ACQUIRED"),
      now,
    });

    expect(result).toEqual({
      classification: {
        completedAt: "2026-06-23T12:00:00.000Z",
        startedAt: "2026-06-23T12:00:00.000Z",
        status: "completed",
      },
      newsCategory: "ACQUIRED",
    });
    // The emitted state round-trips through the persisted saved-run contract.
    expect(() => newsCategoryClassificationStateSchema.parse(result.classification)).not.toThrow();
  });

  test("falls back to VIRAL with a persisted failed state when the classifier throws", async () => {
    const result = await classifyNewsCategory(
      { jokeContextSnapshot: buildSnapshot() },
      { classifier: throwingClassifier("model exploded"), now },
    );

    expect(result.newsCategory).toBe("VIRAL");
    expect(() => newsCategoryClassificationStateSchema.parse(result.classification)).not.toThrow();
    expect(result.classification.status).toBe("failed");
    if (result.classification.status === "failed") {
      expect(result.classification.message).toBe("model exploded");
      expect(result.classification.failedAt).toBe("2026-06-23T12:00:00.000Z");
      expect(result.classification.startedAt).toBe("2026-06-23T12:00:00.000Z");
      expect(
        result.classification.debugLog?.some((line) => line.includes("fell back to VIRAL")),
      ).toBe(true);
    }
  });

  test("falls back to VIRAL when the classifier call times out", async () => {
    const result = await classifyNewsCategory(
      { jokeContextSnapshot: buildSnapshot() },
      {
        classifier: throwingClassifier(
          "News Category classification timed out after 30s waiting for the AI Gateway.",
        ),
        now,
      },
    );

    expect(result.newsCategory).toBe("VIRAL");
    expect(result.classification.status).toBe("failed");
    if (result.classification.status === "failed") {
      expect(result.classification.message).toContain("timed out");
    }
  });

  test("falls back to VIRAL when the classifier returns an off-vocabulary value", async () => {
    const result = await classifyNewsCategory(
      { jokeContextSnapshot: buildSnapshot() },
      { classifier: stubClassifier("BANANA"), now },
    );

    expect(result.newsCategory).toBe("VIRAL");
    expect(result.classification.status).toBe("failed");
    if (result.classification.status === "failed") {
      expect(result.classification.message).toContain("outside the vocabulary");
    }
  });

  test("never retries — it calls the classifier exactly once on failure (No Automatic Retry)", async () => {
    const classify = vi.fn(async () => {
      throw new Error("boom");
    });
    const classifier: NewsCategoryClassifier = { classify, model: "x", provider: "test" };

    await classifyNewsCategory({ jokeContextSnapshot: buildSnapshot() }, { classifier, now });

    expect(classify).toHaveBeenCalledTimes(1);
  });
});

describe("createDefaultNewsCategoryClassifier", () => {
  test("falls back to the local classifier with no API key outside production", () => {
    const classifier = createDefaultNewsCategoryClassifier({
      AI_GATEWAY_ANTHROPIC_MODEL: "anthropic/custom",
    });

    expect(classifier.provider).toBe("local");
    // It reuses the configured Anthropic text model — no new AI_GATEWAY_*_MODEL var.
    expect(classifier.model).toBe("anthropic/custom");
  });

  test("uses the AI-Gateway classifier when credentials are configured", () => {
    const classifier = createDefaultNewsCategoryClassifier({
      AI_GATEWAY_API_KEY: "gateway-secret",
    });

    expect(classifier.provider).toBe("ai-gateway");
    expect(classifier.model).toBe("anthropic/claude-sonnet-4.6");
  });

  test("an automated run reads the spend-capped automated key", () => {
    // Only the automated key is set: an automated classification must still find
    // credentials, proving run kind threads through to key selection.
    const classifier = createDefaultNewsCategoryClassifier(
      { AI_GATEWAY_AUTOMATED_API_KEY: "capped-key" },
      "automated",
    );

    expect(classifier.provider).toBe("ai-gateway");
  });

  test("a manual run ignores the automated key", () => {
    // With only the automated key set, a Workspace run sees no shared credential
    // and falls back to local — the $5/day cap can never throttle a manual run.
    const classifier = createDefaultNewsCategoryClassifier(
      { AI_GATEWAY_AUTOMATED_API_KEY: "capped-key" },
      "manual",
    );

    expect(classifier.provider).toBe("local");
  });
});

describe("createLocalNewsCategoryClassifier", () => {
  test("keyword-maps obvious signals and otherwise falls back to VIRAL", async () => {
    const classifier = createLocalNewsCategoryClassifier("anthropic/claude-sonnet-4.6");

    expect(
      await classifier.classify({
        jokeContextSnapshot: buildSnapshot({
          sourceTweetClaim: "Acme acquires Foo in an all-stock deal.",
        }),
      }),
    ).toBe("ACQUIRED");
    expect(
      await classifier.classify({
        jokeContextSnapshot: buildSnapshot({
          sourceTweetClaim: "BigCo laid off 4,000 staff today.",
          supportingFacts: ["A mass layoff hit the company."],
          jokeableTensions: ["Efficiency framed as the reason."],
        }),
      }),
    ).toBe("FIRED");
    expect(
      await classifier.classify({
        jokeContextSnapshot: buildSnapshot({
          sourceTweetClaim: "A clip of a cat using a keyboard is going around today.",
          supportingFacts: ["People are amused."],
          jokeableTensions: ["The internet enjoys a distraction."],
        }),
      }),
    ).toBe("VIRAL");
  });
});

describe("newsCategoryClassifierInstruction", () => {
  test("encodes the boundary rules and the eight labeled examples as few-shot guidance", () => {
    // The single most important rule and the rule set (ADR-0027).
    expect(newsCategoryClassifierInstruction).toContain(
      "Classify by what the Source Tweet frames as the story",
    );
    expect(newsCategoryClassifierInstruction).toContain(
      "weight of the work separates DROPPED from PUBLISHED",
    );
    expect(newsCategoryClassifierInstruction).toContain("Mass layoffs are FIRED");
    expect(newsCategoryClassifierInstruction).toContain(
      "ACQUIRED, SIGNED, or FUNDED depending on the tweet's framing",
    );

    // A sampling of the eight labeled examples.
    expect(newsCategoryClassifierInstruction).toContain("seed round → LAUNCHED");
    expect(newsCategoryClassifierInstruction).toContain("standalone app → DROPPED");
    expect(newsCategoryClassifierInstruction).toContain("research paper → PUBLISHED");
    expect(newsCategoryClassifierInstruction).toContain("new AI model → DROPPED");

    // Every value in the closed vocabulary is offered as an option.
    for (const category of newsCategories) {
      expect(newsCategoryClassifierInstruction).toContain(category);
    }
  });
});

function buildSnapshot(structuredOverrides: Record<string, unknown> = {}): JokeContextSnapshot {
  const base = buildJokeContextSnapshot();

  return parseJokeContextSnapshot({
    ...base,
    structuredContext: { ...base.structuredContext, ...structuredOverrides },
  });
}

function stubClassifier(value: string): NewsCategoryClassifier {
  return {
    model: "stub-model",
    provider: "test",
    classify: async () => value,
  };
}

function throwingClassifier(message: string): NewsCategoryClassifier {
  return {
    model: "stub-model",
    provider: "test",
    classify: async () => {
      throw new Error(message);
    },
  };
}
