import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import type { GenerationRun } from "@/services/workspace";
import { buildCompletedV3Run, createMemorySavedRunStore } from "../workspace/workspace-test-utils";
import { RunsFeed } from "./runs-feed";
import { undoDeleteWindowMs } from "./use-selected-run";

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

// The delete flow toasts, so these renders also mount the Toaster (mounted once
// at the app root in production). Returns the render result too, for unmount.
function renderFeedWithToaster(runs: GenerationRun[]) {
  const savedRunStore = createMemorySavedRunStore(runs);
  const view = render(
    <>
      <RunsFeed savedRunStore={savedRunStore} />
      <Toaster />
    </>,
  );

  return { savedRunStore, view };
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

  test("picking a News Category chip saves immediately and re-stamps the preview live", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeed([buildCompleteRun()]);

    await openSidebar(user);
    const sidebar = getSidebar();
    const newsCategory = within(sidebar).getByRole("region", { name: "News category" });
    const preview = within(sidebar).getByRole("figure", {
      name: "Final Quote Tweet Image preview",
    });

    // The value-less run pre-selects VIRAL, and the composite stamps it.
    expect(
      within(newsCategory).getByRole("button", { name: "VIRAL", pressed: true }),
    ).toBeInTheDocument();
    expect(within(preview).getByText("VIRAL")).toBeInTheDocument();

    // Pick a different stamp.
    await user.click(within(newsCategory).getByRole("button", { name: "ACQUIRED" }));

    // The discrete pick persists immediately through the whole-run save...
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "complete-run-1", newsCategory: "ACQUIRED" }),
      ),
    );
    // ...the chip selection moves...
    expect(
      within(newsCategory).getByRole("button", { name: "ACQUIRED", pressed: true }),
    ).toBeInTheDocument();
    // ...and the preview re-stamps live with the new value.
    expect(within(preview).getByText("ACQUIRED")).toBeInTheDocument();
    expect(within(preview).queryByText("VIRAL")).not.toBeInTheDocument();
  });

  test("typing a custom News Category word autosaves it (debounced) and re-stamps the preview uppercased", async () => {
    const user = userEvent.setup();
    const savedRunStore = renderFeed([buildCompleteRun()]);

    await openSidebar(user);
    const sidebar = getSidebar();
    const newsCategory = within(sidebar).getByRole("region", { name: "News category" });
    const preview = within(sidebar).getByRole("figure", {
      name: "Final Quote Tweet Image preview",
    });

    // The value-less run pre-selects VIRAL.
    expect(
      within(newsCategory).getByRole("button", { name: "VIRAL", pressed: true }),
    ).toBeInTheDocument();

    // Type a word outside the ten into the custom field.
    await user.type(
      within(newsCategory).getByRole("textbox", { name: "Custom news category" }),
      "breaking",
    );

    // The free-text edit autosaves through the debounced path (not the immediate
    // chip path), storing the word with the typed case...
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "complete-run-1", newsCategory: "breaking" }),
      ),
    );
    // ...the chip selection clears (mutually exclusive)...
    expect(within(newsCategory).queryByRole("button", { pressed: true })).not.toBeInTheDocument();
    // ...and the preview re-stamps live, uppercased.
    expect(within(preview).getByText("BREAKING")).toBeInTheDocument();
    expect(within(preview).queryByText("VIRAL")).not.toBeInTheDocument();
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

  test("deleting a run removes its card and shows a quiet Undo toast — no blocking dialog", async () => {
    const user = userEvent.setup();
    const { savedRunStore } = renderFeedWithToaster([buildCompleteRun()]);

    await openSidebar(user);
    // The run's card is in the feed before deletion.
    expect(getFeedCard()).toBeInTheDocument();

    await user.click(within(getSidebar()).getByRole("button", { name: /delete run/i }));

    // The card leaves the feed and the sidebar closes with it.
    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "Complete run 1" })).not.toBeInTheDocument(),
    );
    // A quiet toast confirms — no blocking dialog — and carries an Undo action.
    expect(await screen.findByText("Run deleted")).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "Undo" })).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    // The delete is deferred — nothing is persisted during the undo window.
    expect(savedRunStore.delete).not.toHaveBeenCalled();
  });

  test("Undo restores the card and never deletes the run", async () => {
    const user = userEvent.setup();
    const { savedRunStore } = renderFeedWithToaster([buildCompleteRun()]);

    await openSidebar(user);
    await user.click(within(getSidebar()).getByRole("button", { name: /delete run/i }));
    await waitFor(() =>
      expect(screen.queryByRole("article", { name: "Complete run 1" })).not.toBeInTheDocument(),
    );

    // Undo brings the card back...
    await user.click(await screen.findByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("article", { name: "Complete run 1" })).toBeInTheDocument();
    // ...and the delete never reached the store.
    expect(savedRunStore.delete).not.toHaveBeenCalled();
  });

  test("commits the delete to the store once the undo window passes", async () => {
    const user = userEvent.setup();
    const { savedRunStore } = renderFeedWithToaster([buildCompleteRun()]);

    // Open the sidebar under real timers — the feed's async load and findBy
    // queries don't advance under a fake clock — then fake only the undo window.
    await openSidebar(user);

    vi.useFakeTimers();

    try {
      // fireEvent is synchronous, so it needs no userEvent timer advancing here.
      fireEvent.click(within(getSidebar()).getByRole("button", { name: /delete run/i }));

      // Deferred — nothing persisted yet.
      expect(savedRunStore.delete).not.toHaveBeenCalled();

      // Let the undo window elapse; the delete now commits exactly once.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(undoDeleteWindowMs);
      });

      expect(savedRunStore.delete).toHaveBeenCalledWith("complete-run-1");
      expect(savedRunStore.delete).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("commits a still-pending delete when the feed unmounts", async () => {
    const user = userEvent.setup();
    const { savedRunStore, view } = renderFeedWithToaster([buildCompleteRun()]);

    await openSidebar(user);
    await user.click(within(getSidebar()).getByRole("button", { name: /delete run/i }));
    // Deferred — still inside the undo window.
    expect(savedRunStore.delete).not.toHaveBeenCalled();

    // Tearing down the feed commits the pending delete rather than dropping it.
    view.unmount();
    expect(savedRunStore.delete).toHaveBeenCalledWith("complete-run-1");
  });
});
