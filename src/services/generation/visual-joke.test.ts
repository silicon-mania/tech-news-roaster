import { describe, expect, test } from "vitest";
import {
  buildStubbedGenerationEvents,
  parseCompletedGenerationRunPayload,
  parseSelectedVisualJoke,
  parseVisualJoke,
  parseVisualJokeSet,
} from "@/services/generation";
import { buildReplySignals } from "@/services/outside-x-enrichment";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import { buildVisualJoke, buildVisualJokeSet } from "./test-fixtures";

describe("visual joke contracts", () => {
  test("parses a categorized 3-section set with ordered top picks", () => {
    const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());

    expect(visualJokeSet.jokes).toHaveLength(6);
    expect(new Set(visualJokeSet.jokes.map((joke) => joke.section))).toEqual(
      new Set(["satire", "tech-positive", "experimental"]),
    );
    expect(visualJokeSet.topPicks.map((topPick) => topPick.visualJokeId)).toEqual([
      "visual-joke-1",
      "visual-joke-2",
    ]);
    expect(visualJokeSet.targetPerSection).toBe(7);
  });

  test("accepts a minimal one-joke set", () => {
    expect(() =>
      parseVisualJokeSet({
        ...buildVisualJokeSet(),
        jokes: [{ id: "visual-joke-1", order: 1, section: "satire", text: "Just the one." }],
        topPicks: [{ reason: "Only candidate.", visualJokeId: "visual-joke-1" }],
      }),
    ).not.toThrow();
  });

  test("rejects an empty set", () => {
    expect(() =>
      parseVisualJokeSet({ ...buildVisualJokeSet(), jokes: [], topPicks: [] }),
    ).toThrow();
  });

  test("rejects duplicate joke ids", () => {
    const set = buildVisualJokeSet();

    expect(() =>
      parseVisualJokeSet({
        ...set,
        jokes: [set.jokes[0], { ...set.jokes[1], id: set.jokes[0].id }, ...set.jokes.slice(2)],
        topPicks: [{ reason: "Sharpest.", visualJokeId: set.jokes[0].id }],
      }),
    ).toThrow();
  });

  test("rejects non-contiguous within-section order", () => {
    const set = buildVisualJokeSet();
    // visual-joke-4 is the second satire joke (order 2); a jump to 3 leaves the
    // satire section with orders [1, 3].
    const jokes = set.jokes.map((joke) =>
      joke.id === "visual-joke-4" ? { ...joke, order: 3 } : joke,
    );

    expect(() => parseVisualJokeSet({ ...set, jokes })).toThrow();
  });

  test("rejects a section over the target per section", () => {
    expect(() =>
      parseVisualJokeSet({
        ...buildVisualJokeSet(),
        jokes: Array.from({ length: 8 }, (_value, index) => ({
          id: `visual-joke-${index + 1}`,
          order: index + 1,
          section: "satire",
          text: `Satire ${index + 1}`,
        })),
        topPicks: [{ reason: "Sharpest.", visualJokeId: "visual-joke-1" }],
      }),
    ).toThrow();
  });

  test("rejects a top pick referencing a missing joke", () => {
    expect(() =>
      parseVisualJokeSet({
        ...buildVisualJokeSet(),
        topPicks: [{ reason: "Points nowhere.", visualJokeId: "visual-joke-missing" }],
      }),
    ).toThrow();
  });

  test("rejects more than three top picks", () => {
    const set = buildVisualJokeSet();

    expect(() =>
      parseVisualJokeSet({
        ...set,
        topPicks: set.jokes.slice(0, 4).map((joke) => ({ reason: "Pick.", visualJokeId: joke.id })),
      }),
    ).toThrow();
  });

  test("rejects malformed jokes and out-of-set selections", () => {
    const visualJokeSet = parseVisualJokeSet(buildVisualJokeSet());

    expect(() => parseVisualJoke({ ...buildVisualJoke(0), text: " " })).toThrow();
    expect(() => parseVisualJoke({ ...buildVisualJoke(0), order: 0 })).toThrow();

    expect(() =>
      parseSelectedVisualJoke(
        {
          selectedAt: "2026-06-06T10:14:00.000Z",
          visualJokeId: "visual-joke-missing",
        },
        visualJokeSet,
      ),
    ).toThrow();

    expect(() =>
      parseCompletedGenerationRunPayload({
        label: "Drafts for 2468",
        sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468").sourceTweet,
        drafts: buildStubbedGenerationEvents({
          replySignals: buildReplySignals(
            buildFixtureTweetContext("https://x.com/siliconmania/status/2468"),
          ),
          sourceTweet: buildFixtureTweetContext("https://x.com/siliconmania/status/2468")
            .sourceTweet,
          sourceTweetUrl: "https://x.com/siliconmania/status/2468",
          usersDirection: "Keep it skeptical.",
        }).flatMap((event) => (event.type === "progress" ? [event.draft] : [])),
        selectedVisualJoke: {
          selectedAt: "2026-06-06T10:14:00.000Z",
          visualJokeId: "visual-joke-missing",
        },
        visualJokeSet,
      }),
    ).toThrow();
  });
});
