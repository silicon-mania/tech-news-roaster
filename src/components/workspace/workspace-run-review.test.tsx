import "@testing-library/jest-dom/vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { GenerationRun } from "./workspace";
import {
  buildCompletedRun,
  buildCompletedV3Run,
  createMemorySavedRunStore,
  renderWorkspace,
} from "./workspace-test-utils";

// buildCompletedV3Run selects jokes[1] by default; this fixture is its first
// generated variation. Both are the two inputs the Final Quote Tweet Image
// derives from (ADR-0018).
const selectedGeneratedImageFixture = {
  imageOptionId: "image-option-news-linked-image-1-variation-1",
  selectedAt: "2026-06-06T10:17:00.000Z",
};

describe("Workspace run review and override loop", () => {
  test("marks a run seen when the operator opens it, clearing the unseen marker and persisting seenAt", async () => {
    const user = userEvent.setup();
    const activeSeenRun = buildCompletedRun({
      id: "active-run",
      label: "Already opened run",
      savedAt: "2026-06-06T10:00:00.000Z",
      seenAt: "2026-06-06T10:05:00.000Z",
    });
    const unseenRun = buildCompletedRun({
      id: "unseen-run",
      label: "Brand new run",
      savedAt: "2026-06-06T09:00:00.000Z",
    });
    const savedRunStore = createMemorySavedRunStore();

    renderWorkspace({
      initialActiveRunId: "active-run",
      initialRuns: [activeSeenRun, unseenRun],
      savedRunStore,
    });

    await user.click(screen.getByRole("button", { name: /open runs, 2 saved/i }));

    const unseenRunButton = screen.getByRole("button", { name: /brand new run/i });
    // The unopened run carries the unseen marker; the already-opened active run does not.
    expect(within(unseenRunButton).getByText("Unseen")).toBeInTheDocument();
    expect(
      within(screen.getByRole("button", { name: /already opened run/i })).queryByText("Unseen"),
    ).not.toBeInTheDocument();
    expect(savedRunStore.markSeen).not.toHaveBeenCalled();

    await user.click(unseenRunButton);

    await waitFor(() => expect(savedRunStore.markSeen).toHaveBeenCalledWith("unseen-run"));
    expect(
      within(screen.getByRole("button", { name: /brand new run/i })).queryByText("Unseen"),
    ).not.toBeInTheDocument();
  });

  test("overriding the Selected Draft persists the explicit pick", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [buildCompletedRun()],
      savedRunStore,
    });

    const draftStack = screen.getByRole("region", { name: /completed draft stack/i });

    // No draft is selected until the operator picks one.
    expect(within(draftStack).getByRole("button", { name: /select draft 1/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await user.click(within(draftStack).getByRole("button", { name: /select draft 1/i }));

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "saved-run", selectedDraftId: "draft-openai" }),
      ),
    );
    expect(
      within(draftStack).getByRole("button", { name: /clear draft 1 selection/i }),
    ).toHaveAttribute("aria-pressed", "true");

    // Re-picking another draft replaces the choice — only one stays selected.
    await user.click(within(draftStack).getByRole("button", { name: /expand draft 2/i }));
    await user.click(within(draftStack).getByRole("button", { name: /select draft 2/i }));

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: "saved-run", selectedDraftId: "draft-anthropic" }),
      ),
    );
  });

  test("re-picking a generated image instantly recomposes the Final Quote Tweet Image without regeneration", async () => {
    const user = userEvent.setup();
    const onStartImageGeneration = vi.fn();
    const imageGenerationStreamFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(""),
    );

    const { generationStreamUrls } = renderWorkspace({
      imageGenerationStreamFetcher,
      initialActiveRunId: "saved-run",
      initialRuns: [buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })],
      onStartImageGeneration,
    });

    const finalArea = screen.getByRole("region", {
      name: /final quote tweet image creative result area/i,
    });
    // Derived from the first variation before any override.
    expect(
      within(finalArea).getByRole("img", { name: "Launch visual variation 1." }),
    ).toBeInTheDocument();

    const imageResultsArea = screen.getByRole("region", { name: /image results area/i });
    await user.click(
      within(imageResultsArea).getByRole("button", { name: /^select variation 2$/i }),
    );

    // The composite re-derives instantly from the new pick — same template, new image.
    await waitFor(() =>
      expect(
        within(
          screen.getByRole("region", {
            name: /final quote tweet image creative result area/i,
          }),
        ).getByRole("img", { name: "Launch visual variation 2." }),
      ).toBeInTheDocument(),
    );

    // Re-picking is pure rendering: nothing is regenerated.
    expect(onStartImageGeneration).not.toHaveBeenCalled();
    expect(imageGenerationStreamFetcher).not.toHaveBeenCalled();
    expect(generationStreamUrls).toEqual([]);
  });

  test("overriding the Selected Visual Joke instantly retitles the Final Quote Tweet Image", async () => {
    const user = userEvent.setup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })],
    });

    const finalArea = screen.getByRole("region", {
      name: /final quote tweet image creative result area/i,
    });
    expect(
      within(finalArea).getByText(
        "A workflow map where every exit arrow points back to the login screen.",
      ),
    ).toBeInTheDocument();

    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });
    await user.click(within(visualJokeArea).getByRole("button", { name: /select visual joke 4/i }));

    await waitFor(() =>
      expect(
        within(
          screen.getByRole("region", {
            name: /final quote tweet image creative result area/i,
          }),
        ).getByText("A polished product card with one button: 'Automate explaining this later.'"),
      ).toBeInTheDocument(),
    );
  });
});

// A reload round-trip: an override saved through the store is read back as the
// same persisted selection, proving overrides survive reload (ADR-0019).
describe("Workspace run review persistence round-trip", () => {
  test("a Selected Draft override survives a reload", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ id: "saved-run", selectedDraftId: "draft-google" }),
    ]);

    renderWorkspace({ savedRunStore });

    const draftStack = await screen.findByRole("region", { name: /completed draft stack/i });

    // The store still holds the persisted pick after the reload-style hydration.
    expect((savedRunStore.savedRuns.get("saved-run") as GenerationRun).selectedDraftId).toBe(
      "draft-google",
    );

    // draft-google is the third draft; expanding it surfaces it as already selected.
    await user.click(within(draftStack).getByRole("button", { name: /expand draft 3/i }));
    expect(
      within(draftStack).getByRole("button", { name: /clear draft 3 selection/i }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
