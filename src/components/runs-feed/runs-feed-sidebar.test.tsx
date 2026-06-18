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
    const sourceLink = within(sidebar).getByRole("link");
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
