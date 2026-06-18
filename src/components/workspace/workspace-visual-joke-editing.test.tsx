import "@testing-library/jest-dom/vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import {
  buildCompletedV3Run,
  createMemorySavedRunStore,
  renderWorkspace,
} from "./workspace-test-utils";

const selectedGeneratedImageFixture = {
  imageOptionId: "image-option-news-linked-image-1-variation-1",
  selectedAt: "2026-06-06T10:17:00.000Z",
};
// buildCompletedV3Run selects jokes[1] (the first Tech-positive joke) by default.
const selectedJokeTitle = "A workflow map where every exit arrow points back to the login screen.";

describe("Workspace visual joke editing", () => {
  test("edits a Joke Title in place and persists the overwrite through autosave", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })],
      savedRunStore,
    });

    // Even a non-selected joke is now editable in the workspace; the edit
    // overwrites the joke within the run's own set (no original retained).
    await user.click(screen.getByRole("button", { name: /edit satire visual joke 1/i }));
    const editor = screen.getByRole("textbox", { name: /edit satire visual joke 1/i });

    await user.clear(editor);
    await user.type(editor, "A launch button that quietly reinstalls the bottleneck.");

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenLastCalledWith(
        expect.objectContaining({
          id: "saved-run",
          visualJokeSet: expect.objectContaining({
            jokes: expect.arrayContaining([
              expect.objectContaining({
                id: "visual-joke-1",
                text: "A launch button that quietly reinstalls the bottleneck.",
              }),
            ]),
          }),
        }),
      ),
    );
  });

  test("re-derives the Final Quote Tweet Image when the selected joke's title is rewritten", async () => {
    const user = userEvent.setup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })],
    });

    const finalArea = screen.getByRole("region", {
      name: /final quote tweet image creative result area/i,
    });

    // The composite derives from the Selected Visual Joke's title.
    expect(within(finalArea).getByText(selectedJokeTitle)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /edit tech-positive visual joke 1/i }));
    const editor = screen.getByRole("textbox", { name: /edit tech-positive visual joke 1/i });

    await user.clear(editor);
    await user.type(editor, "Every workflow exit arrow loops back to the login screen.");

    // The overlay owns no selection state — it re-derives live from the new title.
    expect(
      within(finalArea).getByText("Every workflow exit arrow loops back to the login screen."),
    ).toBeInTheDocument();
    expect(within(finalArea).queryByText(selectedJokeTitle)).not.toBeInTheDocument();
  });
});
