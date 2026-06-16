import { describe, expect, test } from "vitest";
import { tokenSimilarity } from "./cluster-similarity";

describe("tokenSimilarity", () => {
  test("scores identical text as 1", () => {
    expect(tokenSimilarity("OpenAI ships agent workspace", "OpenAI ships agent workspace")).toBe(1);
  });

  test("scores disjoint topics near 0", () => {
    expect(tokenSimilarity("OpenAI ships an agent workspace", "Tesla recalls factory robots")).toBe(
      0,
    );
  });

  test("scores shared news vocabulary above unrelated tweets", () => {
    const aboutSameNews = tokenSimilarity(
      "OpenAI launches a new agent workspace for product teams",
      "OpenAI just shipped an agent workspace product",
    );
    const aboutDifferentNews = tokenSimilarity(
      "OpenAI launches a new agent workspace for product teams",
      "Apple announces a foldable iPhone next spring",
    );

    expect(aboutSameNews).toBeGreaterThan(aboutDifferentNews);
    expect(aboutSameNews).toBeGreaterThan(0);
  });

  test("ignores stop words and one-character tokens", () => {
    // Only the stop words "the/and/is/a" plus a lone "x" differ — content tokens match.
    expect(tokenSimilarity("agent workspace launch", "the agent workspace and a launch x")).toBe(1);
  });

  test("returns 0 when either side has no content tokens", () => {
    expect(tokenSimilarity("the a is to", "agent workspace launch")).toBe(0);
  });
});
