import { describe, expect, test } from "vitest";
import {
  defaultVisualJokeDirection,
  parseVisualJokeDirectionText,
  visualJokeSections,
} from "@/services/generation";

describe("defaultVisualJokeDirection", () => {
  test("is a valid non-empty trimmed Visual Joke Direction", () => {
    expect(defaultVisualJokeDirection.trim().length).toBeGreaterThan(0);
    expect(defaultVisualJokeDirection).toBe(defaultVisualJokeDirection.trim());

    // It satisfies the same contract a User's Direction does, so it flows through
    // the service (and into the quiet Direction reveal) unchanged.
    expect(() => parseVisualJokeDirectionText(defaultVisualJokeDirection)).not.toThrow();
  });

  test("names the three Visual Joke Sections", () => {
    for (const section of visualJokeSections) {
      expect(defaultVisualJokeDirection).toContain(section);
    }
  });

  test("requests the categorized JSON output shape instead of a plain list", () => {
    // The `## format` rewrite asks the model for the JSON object the gateway
    // adapter's json_schema mirrors — jokes by section plus reasoned top picks.
    expect(defaultVisualJokeDirection).toContain('"jokes"');
    expect(defaultVisualJokeDirection).toContain('"topPicks"');
    expect(defaultVisualJokeDirection).toContain('"section"');
    expect(defaultVisualJokeDirection).toContain('"reason"');

    // The old "plain list, bold headlines" instruction is gone.
    expect(defaultVisualJokeDirection).not.toContain("plain list");
  });
});
