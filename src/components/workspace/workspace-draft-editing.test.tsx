import "@testing-library/jest-dom/vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  buildCompletedRun,
  buildImageSet,
  buildNewsLinkedImages,
  buildSavedDraft,
  createMemorySavedRunStore,
  renderWorkspace,
} from "./workspace-test-utils";

describe("Workspace draft editing", () => {
  test("renders completed drafts as a single-open stack with provider provenance and controls", async () => {
    const user = userEvent.setup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [buildCompletedRun()],
    });

    const draftStack = screen.getByRole("region", {
      name: /completed draft stack/i,
    });
    const expandedFirstDraft = within(draftStack).getByRole("article", {
      name: /expanded draft 1/i,
    });
    const collapsedSecondDraft = within(draftStack).getByRole("article", {
      name: /collapsed draft 2/i,
    });

    expect(within(draftStack).queryByText("Saved run")).not.toBeInTheDocument();
    expect(
      within(expandedFirstDraft).getByRole("button", {
        name: /copy draft 1/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(expandedFirstDraft).getByRole("button", {
        name: /show visible rationale for draft 1/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(collapsedSecondDraft).getByText("Quote-tweet draft: second saved draft."),
    ).toHaveClass("line-clamp-3");
    expect(
      within(draftStack).getByRole("img", {
        name: /chatgpt provider icon/i,
      }),
    ).toHaveAttribute("src", expect.stringContaining("chatgpt.png"));
    expect(
      within(draftStack).getByRole("img", {
        name: /claude provider icon/i,
      }),
    ).toHaveAttribute("src", expect.stringContaining("claude.png"));
    expect(
      within(draftStack).getByRole("img", {
        name: /gemini provider icon/i,
      }),
    ).toHaveAttribute("src", expect.stringContaining("gemini.png"));

    await user.click(
      within(collapsedSecondDraft).getByRole("button", {
        name: /expand draft 2/i,
      }),
    );

    expect(
      within(draftStack).getByRole("article", {
        name: /expanded draft 2/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(draftStack).getByRole("article", {
        name: /collapsed draft 1/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(draftStack).getByRole("button", {
        name: /copy draft 2/i,
      }),
    ).toBeInTheDocument();
  });

  test("enters plain-text editing only after clicking an already-expanded draft", async () => {
    const user = userEvent.setup();
    const completedRun = buildCompletedRun({
      drafts: [
        buildSavedDraft({
          id: "draft-openai",
          provider: "openai",
          text: "First line.\nSecond line.",
        }),
        buildSavedDraft({
          id: "draft-anthropic",
          provider: "anthropic",
          text: "Quote-tweet draft: second saved draft.",
        }),
        buildSavedDraft({
          id: "draft-google",
          provider: "google",
          text: "Quote-tweet draft: third saved draft.",
        }),
      ],
    });

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [completedRun],
    });

    const expandedFirstDraft = screen.getByRole("article", {
      name: /expanded draft 1/i,
    });

    expect(
      within(expandedFirstDraft).queryByRole("textbox", {
        name: /edit draft 1/i,
      }),
    ).not.toBeInTheDocument();
    expect(expandedFirstDraft).toHaveTextContent("First line.");

    await user.click(
      within(expandedFirstDraft).getByRole("button", {
        name: /edit draft 1/i,
      }),
    );

    expect(
      within(expandedFirstDraft).getByRole("textbox", {
        name: /edit draft 1/i,
      }),
    ).toHaveValue("First line.\nSecond line.");
    expect(screen.queryByRole("toolbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  test("preserves line breaks, hides autosave state, and copies the current draft text", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);
    const completedRun = buildCompletedRun({
      imageGenerationState: {
        completedAt: "2026-06-05T10:23:00.000Z",
        selectedImageIds: [newsLinkedImages[0].id],
        startedAt: "2026-06-05T10:20:00.000Z",
        status: "completed",
        userImagePrompt: "Keep the image polished.",
      },
      imageModelProvenance: imageSet.imageModelProvenance,
      imageSets: [imageSet],
      newsLinkedImages: newsLinkedImages.slice(0, 1),
      phase: "image-generation-complete",
      selectedImageOriginals: [imageSet.selectedImageOriginal],
    });

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [completedRun],
      savedRunStore,
    });

    expect(screen.getAllByText(/Quote-tweet draft:/)).toHaveLength(3);
    expect(
      screen.getByRole("button", {
        name: /show visible rationale for draft 1/i,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /publish/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /export/i })).toBeNull();
    expect(screen.queryByRole("link", { name: /export/i })).toBeNull();
    expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /edit draft 1/i,
      }),
    );
    const draftEditor = screen.getByRole("textbox", {
      name: /edit draft 1/i,
    });

    await user.clear(draftEditor);
    await user.type(draftEditor, "Edited first line.{enter}Edited second line.");

    expect(screen.queryByText(/autosave|saving/i)).not.toBeInTheDocument();
    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "saved-run",
        drafts: expect.arrayContaining([
          expect.objectContaining({
            id: "draft-openai",
            text: "Edited first line.\nEdited second line.",
          }),
        ]),
        imageGenerationState: completedRun.imageGenerationState,
        imageSets: [imageSet],
        newsLinkedImages: newsLinkedImages.slice(0, 1),
        selectedImageOriginals: [imageSet.selectedImageOriginal],
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: /copy draft 1/i,
      }),
    );

    expect(writeText).toHaveBeenCalledWith("Edited first line.\nEdited second line.");
    expect(await screen.findByText("Draft copied")).toBeInTheDocument();
  });

  test("reopens the latest edited Saved Run content without regenerating", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ id: "saved-run", label: "Editable saved run" }),
      buildCompletedRun({
        id: "other-run",
        label: "Other saved run",
        sourceTweetUrl: "https://x.com/siliconmania/status/222",
        drafts: [
          buildSavedDraft({
            id: "other-openai",
            provider: "openai",
            text: "Other first draft.",
          }),
          buildSavedDraft({
            id: "other-anthropic",
            provider: "anthropic",
            text: "Other second draft.",
          }),
          buildSavedDraft({
            id: "other-google",
            provider: "google",
            text: "Other third draft.",
          }),
        ],
      }),
    ]);
    const { generationStreamUrls } = renderWorkspace({ savedRunStore });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 2 saved/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /editable saved run/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /edit draft 1/i,
      }),
    );
    const draftEditor = screen.getByRole("textbox", {
      name: /edit draft 1/i,
    });

    await user.clear(draftEditor);
    await user.type(draftEditor, "Latest edit line one.{enter}Line two.");
    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));

    // The runs sidebar stays pinned open, so its run buttons remain reachable
    // without re-opening it between selections.
    await user.click(
      screen.getByRole("button", {
        name: /other saved run/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /editable saved run/i,
      }),
    );

    expect(generationStreamUrls).toEqual([]);
    expect(
      screen.getByRole("article", {
        name: /expanded draft 1/i,
      }),
    ).toHaveTextContent("Latest edit line one. Line two.");
  });
});
