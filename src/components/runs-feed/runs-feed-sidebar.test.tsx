import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { GenerationRun } from "@/services/workspace";
import { buildCompletedV3Run, createMemorySavedRunStore } from "../workspace/workspace-test-utils";
import { RunsFeed } from "./runs-feed";

// jsdom has no IntersectionObserver; the feed wires one for append-on-scroll. A
// no-op stub is enough here — these tests never page past the first load.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
const firstDraftText = "Quote-tweet draft: first saved draft.";
const secondDraftText = "Quote-tweet draft: second saved draft.";
// buildCompletedV3Run selects jokes[1] (visual-joke-2, the first Tech-positive
// joke) by default; visual-joke-1 is the set's only Top Pick.
const selectedJokeTitle = "A workflow map where every exit arrow points back to the login screen.";
const topPickJokeTitle = "A one-click launch button labeled 'Eventually, manual work.'";
// buildCompletedV3Run's image set is built from the first news-linked image
// ("Launch visual"); its options' alt text and ids follow from that. With no
// explicit selection the card falls back to the first generated variation.
const firstVariationAlt = "Launch visual variation 1.";
const secondVariationAlt = "Launch visual variation 2.";
const secondVariationOptionId = "image-option-news-linked-image-1-variation-2";

function buildCompleteRun(overrides: Partial<GenerationRun> = {}): GenerationRun {
  return buildCompletedV3Run({
    id: "complete-run-1",
    label: "Complete run 1",
    savedAt: "2026-06-06T11:01:00.000Z",
    ...overrides,
  });
}

function renderFeed(runs: GenerationRun[]) {
  const savedRunStore = createMemorySavedRunStore(runs);

  render(<RunsFeed savedRunStore={savedRunStore} />);

  return savedRunStore;
}

function getSidebar() {
  return screen.getByRole("complementary", { name: "Selected run" });
}

function getFeedCard() {
  return within(screen.getByRole("region", { name: "Runs" })).getByRole("article");
}

// Open the run's sidebar by clicking its full-card overlay button, then wait for
// the Text section's drafts to appear.
async function openSidebar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /open complete run 1/i }));
  await screen.findByRole("region", { name: /completed draft stack/i });
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Selected Run sidebar", () => {
  test("clicking a card opens the sidebar with the Source post and the run's drafts", async () => {
    const user = userEvent.setup();
    renderFeed([buildCompleteRun()]);

    await openSidebar(user);
    const sidebar = getSidebar();

    // The Source post reference links to the original tweet on X in a new tab.
    // (The Image section adds per-variation download links, so scope by name.)
    const sourceLink = within(sidebar).getByRole("link", { name: /open the source post on x/i });
    expect(sourceLink).toHaveAttribute("href", sourceTweetUrl);
    expect(sourceLink).toHaveAttribute("target", "_blank");

    // The Text section lists every draft, each with its provider/model provenance.
    const draftStack = within(sidebar).getByRole("region", { name: /completed draft stack/i });
    expect(within(draftStack).getByText(firstDraftText)).toBeInTheDocument();
    expect(within(draftStack).getByText(secondDraftText)).toBeInTheDocument();
    expect(within(draftStack).getByText("OpenAI local draft model")).toBeInTheDocument();
    expect(within(draftStack).getByText("Anthropic local draft model")).toBeInTheDocument();

    // No save button anywhere — edits autosave.
    expect(within(sidebar).queryByRole("button", { name: /save/i })).not.toBeInTheDocument();
  });

  test("opening a run marks it seen", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeed([buildCompleteRun()]);

    await openSidebar(user);

    await waitFor(() => expect(savedRunStore.markSeen).toHaveBeenCalledWith("complete-run-1"));
  });

  test("switching the selected draft saves immediately and updates the visible card", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeed([buildCompleteRun()]);

    await openSidebar(user);
    const sidebar = getSidebar();

    // With no explicit selection the card shows the first draft.
    expect(within(getFeedCard()).getByText(firstDraftText)).toBeInTheDocument();

    // Switch to the second draft — expand it to reach its Select control.
    await user.click(within(sidebar).getByRole("button", { name: /expand draft 2/i }));
    await user.click(within(sidebar).getByRole("button", { name: /select draft 2/i }));

    // The discrete switch persists the new selection.
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "complete-run-1", selectedDraftId: "draft-anthropic" }),
      ),
    );
    // ...and the card reflects it immediately.
    expect(within(getFeedCard()).getByText(secondDraftText)).toBeInTheDocument();
    expect(within(getFeedCard()).queryByText(firstDraftText)).not.toBeInTheDocument();
  });

  test("inline-editing the selected draft autosaves the overwritten text and updates the card", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeed([buildCompleteRun({ selectedDraftId: "draft-openai" })]);

    await openSidebar(user);
    const sidebar = getSidebar();

    // The first draft is selected and expanded — click its text to edit in place.
    await user.click(within(sidebar).getByRole("button", { name: /edit draft 1/i }));
    const editor = within(sidebar).getByRole("textbox", { name: /edit draft 1/i });
    await user.clear(editor);
    await user.type(editor, "Sharper commentary.");

    // The free-text edit rides the debounced autosave, overwriting the draft text.
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "complete-run-1",
          drafts: expect.arrayContaining([
            expect.objectContaining({ id: "draft-openai", text: "Sharper commentary." }),
          ]),
        }),
      ),
    );
    // The card — the live preview — shows the overwritten commentary.
    expect(within(getFeedCard()).getByText("Sharper commentary.")).toBeInTheDocument();
  });

  test("groups the visual jokes by section with Top Picks flagged", async () => {
    const user = userEvent.setup();
    renderFeed([buildCompleteRun()]);

    await openSidebar(user);
    const visualJokes = within(getSidebar()).getByRole("region", { name: "Visual jokes" });

    expect(within(visualJokes).getByText("Satire")).toBeInTheDocument();
    expect(within(visualJokes).getByText("Tech-positive")).toBeInTheDocument();
    expect(within(visualJokes).getByText("Experimental")).toBeInTheDocument();
    // visual-joke-1 is the set's only Top Pick.
    expect(within(visualJokes).getByText("Top pick 1")).toBeInTheDocument();
  });

  test("switching the selected visual joke saves immediately and updates the visible card", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeed([buildCompleteRun()]);

    await openSidebar(user);
    const sidebar = getSidebar();

    // The card's Final Quote Tweet Image starts on the explicitly selected joke.
    expect(within(getFeedCard()).getByText(selectedJokeTitle)).toBeInTheDocument();

    // Switch to the first Satire joke (the Top Pick).
    await user.click(
      within(sidebar).getByRole("button", { name: /^select satire visual joke 1$/i }),
    );

    // The discrete switch persists the new selection immediately.
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "complete-run-1",
          selectedVisualJoke: expect.objectContaining({ visualJokeId: "visual-joke-1" }),
        }),
      ),
    );
    // ...and the card's image reflects the new Joke Title immediately.
    expect(within(getFeedCard()).getByText(topPickJokeTitle)).toBeInTheDocument();
    expect(within(getFeedCard()).queryByText(selectedJokeTitle)).not.toBeInTheDocument();
  });

  test("inline-editing the selected joke's title autosaves the overwrite and re-derives the card", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeed([buildCompleteRun()]);

    await openSidebar(user);
    const sidebar = getSidebar();

    // The selected joke's title sits on the card's Final Quote Tweet Image.
    expect(within(getFeedCard()).getByText(selectedJokeTitle)).toBeInTheDocument();

    await user.click(
      within(sidebar).getByRole("button", { name: /edit tech-positive visual joke 1/i }),
    );
    const editor = within(sidebar).getByRole("textbox", {
      name: /edit tech-positive visual joke 1/i,
    });
    await user.clear(editor);
    await user.type(editor, "Every workflow exit arrow loops back to the login screen.");

    // The free-text edit rides the debounced autosave, overwriting the title
    // within the run's own visual joke set.
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "complete-run-1",
          visualJokeSet: expect.objectContaining({
            jokes: expect.arrayContaining([
              expect.objectContaining({
                id: "visual-joke-2",
                text: "Every workflow exit arrow loops back to the login screen.",
              }),
            ]),
          }),
        }),
      ),
    );
    // The card re-derives its image from the overwritten title.
    expect(
      within(getFeedCard()).getByText("Every workflow exit arrow loops back to the login screen."),
    ).toBeInTheDocument();
    expect(within(getFeedCard()).queryByText(selectedJokeTitle)).not.toBeInTheDocument();
  });

  test("switching the image variation saves immediately and updates the visible card", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeed([buildCompleteRun()]);

    await openSidebar(user);
    const sidebar = getSidebar();

    // With no explicit selection the card's Final Quote Tweet Image shows the
    // first generated variation (the Automated Selection fallback).
    expect(within(getFeedCard()).getByAltText(firstVariationAlt)).toBeInTheDocument();

    // Switch to the second variation.
    await user.click(within(sidebar).getByRole("button", { name: /^select variation 2$/i }));

    // The discrete switch persists the new selection immediately.
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "complete-run-1",
          selectedGeneratedImage: expect.objectContaining({
            imageOptionId: secondVariationOptionId,
          }),
        }),
      ),
    );
    // ...and the card's image reflects the new variation immediately.
    expect(within(getFeedCard()).getByAltText(secondVariationAlt)).toBeInTheDocument();
    expect(within(getFeedCard()).queryByAltText(firstVariationAlt)).not.toBeInTheDocument();
  });

  test("only the four variations are switchable — no original switch, regeneration, or prompt", async () => {
    const user = userEvent.setup();
    renderFeed([buildCompleteRun()]);

    await openSidebar(user);
    const imageSection = within(getSidebar()).getByRole("region", { name: "Image" });

    // Exactly the four generated variations carry a Select control.
    expect(
      within(imageSection).getAllByRole("button", { name: /^select variation \d$/i }),
    ).toHaveLength(4);
    // The Selected Image Original is display-only — there is no way to switch to it.
    expect(
      within(imageSection).queryByRole("button", { name: /select original/i }),
    ).not.toBeInTheDocument();
    // Heavy image work stays in the workspace: no regeneration and no prompt input.
    expect(
      within(imageSection).queryByRole("button", { name: /regenerate|generate/i }),
    ).not.toBeInTheDocument();
    expect(within(imageSection).queryByRole("textbox")).not.toBeInTheDocument();
  });

  test("closing the sidebar dismisses it without persisting anything", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeed([buildCompleteRun()]);

    await openSidebar(user);
    await user.click(within(getSidebar()).getByRole("button", { name: /close selected run/i }));

    // The Text section is gone once closed; merely viewing a run writes nothing.
    await waitFor(() =>
      expect(
        screen.queryByRole("region", { name: /completed draft stack/i }),
      ).not.toBeInTheDocument(),
    );
    expect(savedRunStore.save).not.toHaveBeenCalled();
  });
});
