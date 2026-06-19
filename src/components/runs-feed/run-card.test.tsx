import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import type { GenerationRun } from "@/services/workspace";
import { buildCompletedV3Run } from "../workspace/workspace-test-utils";
import { RunCard } from "./run-card";

const firstDraftText = "Quote-tweet draft: first saved draft.";
const secondDraftText = "Quote-tweet draft: second saved draft.";
const firstVariationAlt = "Launch visual variation 1.";
// buildCompletedV3Run selects jokes[1] (visual-joke-2) by default; visual-joke-1
// is the set's first Top Pick, the no-selection fallback.
const explicitJokeTitle = "A workflow map where every exit arrow points back to the login screen.";
const firstTopPickJokeTitle = "A one-click launch button labeled 'Eventually, manual work.'";
const sourceTweetText =
  "OpenAI just shipped an agent workspace for product teams, and every incumbent suddenly has to explain why their roadmap still looks like a settings page.";

// The fixture's source author is Silicon Mania — identical to the fixed Operator
// Account — which would make "header vs embedded author" assertions ambiguous.
// Give the embedded Source Tweet a distinct author; everything else is unchanged.
function buildCardRun(overrides: Partial<GenerationRun> = {}): GenerationRun {
  const { sourceTweet } = buildFixtureTweetContext("https://x.com/openainews/status/1234567890");

  return buildCompletedV3Run({
    sourceTweet: {
      ...sourceTweet,
      author: { displayName: "OpenAI Newsroom", username: "openainews" },
    },
    ...overrides,
  });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RunCard", () => {
  test("shows the fixed Operator Account header", () => {
    render(<RunCard run={buildCardRun()} />);

    expect(screen.getByText("Silicon Mania")).toBeInTheDocument();
    expect(screen.getByText("@siliconmania")).toBeInTheDocument();
    expect(screen.getByText("Verified account")).toBeInTheDocument();
  });

  test("uses the resolved Selected Draft as commentary", () => {
    render(<RunCard run={buildCardRun({ selectedDraftId: "draft-anthropic" })} />);

    expect(screen.getByText(secondDraftText)).toBeInTheDocument();
    expect(screen.queryByText(firstDraftText)).not.toBeInTheDocument();
  });

  test("renders the Final Quote Tweet Image composite with the chosen joke and variation", () => {
    render(<RunCard run={buildCardRun()} />);

    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();
    // The chosen Joke Title (explicit) sits on the first generated variation (the
    // image falls back since the fixture has no explicit image selection).
    expect(screen.getByText(explicitJokeTitle)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: firstVariationAlt })).toBeInTheDocument();
  });

  test("embeds the Source Tweet as a static, non-interactive quoted post", () => {
    render(<RunCard run={buildCardRun()} />);

    const card = screen.getByRole("article", { name: "Saved run" });

    expect(within(card).getByText(sourceTweetText)).toBeInTheDocument();
    expect(within(card).getByText("OpenAI Newsroom")).toBeInTheDocument();
    expect(within(card).getByText("@openainews")).toBeInTheDocument();
    // Static, not a link — opening the source on X belongs to the sidebar.
    expect(within(card).queryByRole("link")).not.toBeInTheDocument();
  });

  test("renders the embedded Source Tweet as a compact, clamped preview like X's quoted tweet", () => {
    render(<RunCard run={buildCardRun()} />);

    const card = screen.getByRole("article", { name: "Saved run" });

    // The quoted original is line-clamped so a long source post can't stretch the
    // card into a vertical strip; the full text remains in the DOM (clamped via CSS).
    expect(within(card).getByText(sourceTweetText)).toHaveClass("line-clamp-3");
  });

  test("renders two relative timestamps beneath the card", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-06T12:00:00.000Z"));

    render(<RunCard run={buildCardRun()} />);

    // savedAt 10:26 → ~1h; source createdAt 2026-06-05T10:00 → ~26h.
    expect(screen.getByText("generated 1 hour ago")).toBeInTheDocument();
    expect(screen.getByText("original tweet posted 1 day ago")).toBeInTheDocument();
  });

  test("defaults to first draft / first Top Pick joke / first variation with no selection", () => {
    render(
      <RunCard
        run={buildCardRun({
          selectedDraftId: undefined,
          selectedGeneratedImage: null,
          selectedVisualJoke: null,
        })}
      />,
    );

    expect(screen.getByText(firstDraftText)).toBeInTheDocument();
    expect(screen.getByText(firstTopPickJokeTitle)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: firstVariationAlt })).toBeInTheDocument();
  });

  test("has no delete control on the card itself — only the open-sidebar target", () => {
    render(<RunCard run={buildCardRun()} onSelect={vi.fn()} />);

    const card = screen.getByRole("article", { name: "Saved run" });

    // Delete lives only in the Selected Run sidebar, never on the card, so a run
    // can't be removed by accident while scrolling and clicking to select.
    expect(within(card).queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
    // The whole card is a single click target: it opens the sidebar, nothing else.
    expect(within(card).getByRole("button", { name: /open saved run/i })).toBeInTheDocument();
  });
});
