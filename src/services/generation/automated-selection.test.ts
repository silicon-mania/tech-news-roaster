import { describe, expect, test } from "vitest";
import {
  type AutomatedSelectionResults,
  deriveAutomatedSelection,
  type ImageOriginalCandidate,
  imageOriginalCandidateSchema,
  parseImageSet,
  parseVisualJokeSet,
  type QuoteTweetDraft,
  type VisualJokeSet,
} from "@/services/generation";
import { buildImageSet, buildVisualJokeSet, buildVisualJokes } from "./test-fixtures";

const fixedNow = () => new Date("2026-06-16T12:00:00.000Z");
const selectedAt = "2026-06-16T12:00:00.000Z";

const drafts: QuoteTweetDraft[] = [
  {
    id: "draft-openai",
    angle: "platform leverage",
    text: "First draft.",
    modelProvenance: "openai/gpt",
    provider: "openai",
    visibleRationale: "Leads on the pricing tension.",
  },
  {
    id: "draft-anthropic",
    angle: "labor framing",
    text: "Second draft.",
    modelProvenance: "anthropic/claude",
    provider: "anthropic",
    visibleRationale: "Leans on the workflow promise.",
  },
  {
    id: "draft-google",
    angle: "adoption skepticism",
    text: "Third draft.",
    modelProvenance: "google/gemini",
    provider: "google",
    visibleRationale: "Questions the rollout.",
  },
];

const candidates: ImageOriginalCandidate[] = [
  imageOriginalCandidateSchema.parse({
    id: "source-tweet-media-candidate-1",
    origin: "source-tweet-media",
    url: "https://example.com/source-media.jpg",
    altText: "Source tweet screenshot.",
  }),
  imageOriginalCandidateSchema.parse({
    id: "news-linked-image-candidate-2",
    origin: "news-linked-image",
    url: "https://example.com/news-linked.jpg",
    sourceUrl: "https://example.com/report",
    title: "Launch coverage",
  }),
];

function buildFullResults(): AutomatedSelectionResults {
  return {
    drafts,
    visualJokeSet: parseVisualJokeSet(buildVisualJokeSet()),
    imageOriginalCandidates: candidates,
    imageSet: parseImageSet(buildImageSet()),
  };
}

describe("deriveAutomatedSelection", () => {
  test("maps a fully generated run to the four Manual-Run selection fields", () => {
    const selection = deriveAutomatedSelection(buildFullResults(), { now: fixedNow });

    expect(selection).toEqual({
      // First text draft as Selected Draft.
      selectedDraftId: "draft-openai",
      // First Top Pick as Selected Visual Joke.
      selectedVisualJoke: {
        selectedAt,
        visualJokeId: "visual-joke-1",
      },
      // The original the Image Set was generated from, read straight from the set.
      selectedImageOriginal: parseImageSet(buildImageSet()).selectedImageOriginal,
      // First generated variation (never the original) as Selected Generated Image.
      selectedGeneratedImage: {
        imageOptionId: "image-option-variation-1",
        selectedAt,
      },
    });
  });

  test("is deterministic for identical inputs and clock", () => {
    const first = deriveAutomatedSelection(buildFullResults(), { now: fixedNow });
    const second = deriveAutomatedSelection(buildFullResults(), { now: fixedNow });

    expect(first).toEqual(second);
  });

  test("stamps every selection with a single clock read", () => {
    const selection = deriveAutomatedSelection(buildFullResults(), { now: fixedNow });

    expect(selection.selectedVisualJoke?.selectedAt).toBe(selectedAt);
    expect(selection.selectedGeneratedImage?.selectedAt).toBe(selectedAt);
  });

  test("selects the first Top Pick even when it is not the first joke", () => {
    const topPickThird: VisualJokeSet = {
      generatedAt: "2026-06-06T10:12:00.000Z",
      id: "visual-joke-set-top-pick-third",
      targetPerSection: 7,
      jokes: buildVisualJokes(5),
      topPicks: [{ reason: "The third joke is the sharpest.", visualJokeId: "visual-joke-3" }],
    };

    const selection = deriveAutomatedSelection(
      { drafts, visualJokeSet: topPickThird },
      { now: fixedNow },
    );

    expect(selection.selectedVisualJoke?.visualJokeId).toBe("visual-joke-3");
  });

  test("falls back to the first joke when the set carries no top picks", () => {
    const noTopPicks: VisualJokeSet = {
      generatedAt: "2026-06-06T10:12:00.000Z",
      id: "visual-joke-set-no-top-picks",
      targetPerSection: 7,
      jokes: buildVisualJokes(5),
      // Defensive: the schema guarantees at least one Top Pick, but a hand-built or
      // degraded set must still degrade to a sensible pick rather than none.
      topPicks: [],
    };

    const selection = deriveAutomatedSelection(
      { drafts, visualJokeSet: noTopPicks },
      { now: fixedNow },
    );

    expect(selection.selectedVisualJoke?.visualJokeId).toBe("visual-joke-1");
  });

  test("derives Selected Image Original from the first candidate before an Image Set exists", () => {
    const selection = deriveAutomatedSelection(
      { drafts, imageOriginalCandidates: candidates },
      { now: fixedNow },
    );

    expect(selection.selectedImageOriginal).toEqual({
      id: "selected-original-source-tweet-media-candidate-1",
      candidateId: "source-tweet-media-candidate-1",
      origin: "source-tweet-media",
      url: "https://example.com/source-media.jpg",
      altText: "Source tweet screenshot.",
      preparedAt: selectedAt,
    });
    // No Image Set means no generated variation to select yet.
    expect(selection.selectedGeneratedImage).toBeUndefined();
  });

  test("prefers the Image Set's original over the candidates when both are present", () => {
    const selection = deriveAutomatedSelection(buildFullResults(), { now: fixedNow });

    expect(selection.selectedImageOriginal).toEqual(
      parseImageSet(buildImageSet()).selectedImageOriginal,
    );
  });

  test("omits selections for outputs that were not generated, without throwing", () => {
    const selection = deriveAutomatedSelection({ drafts: [] }, { now: fixedNow });

    expect(selection).toEqual({});
  });

  test("sets only the draft when text is the run's single successful area", () => {
    const selection = deriveAutomatedSelection({ drafts }, { now: fixedNow });

    expect(selection).toEqual({ selectedDraftId: "draft-openai" });
  });

  test("works without an injected clock and stamps a valid ISO timestamp", () => {
    const selection = deriveAutomatedSelection(buildFullResults());

    expect(selection.selectedDraftId).toBe("draft-openai");
    expect(() => new Date(selection.selectedVisualJoke?.selectedAt ?? "")).not.toThrow();
    expect(Number.isNaN(Date.parse(selection.selectedVisualJoke?.selectedAt ?? ""))).toBe(false);
  });
});
