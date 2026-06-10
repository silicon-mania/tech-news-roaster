import { describe, expect, test } from "vitest";
import { parseJokeContextSnapshot, parseStructuredJokeContext } from "@/services/generation";
import { buildJokeContextSnapshot, buildStructuredJokeContext } from "./test-fixtures";

describe("joke context contracts", () => {
  test("rejects invalid v3 joke context payloads", () => {
    expect(() =>
      parseStructuredJokeContext({
        ...buildStructuredJokeContext(),
        jokeableTensions: [],
      }),
    ).toThrow();

    expect(() =>
      parseJokeContextSnapshot({
        ...buildJokeContextSnapshot(),
        structuredContext: {
          ...buildStructuredJokeContext(),
          sourceTweetMediaExtraction: {
            summary: "Media read",
            visibleText: ["Headline"],
            notableDetails: ["UI screenshot"],
            mediaKinds: [],
          },
        },
      }),
    ).toThrow();
  });
});
