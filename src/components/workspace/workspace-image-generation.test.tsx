import "@testing-library/jest-dom/vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  buildCompletedRun,
  buildFailedImageSet,
  buildImageGenerationStreamResponse,
  buildImageOriginalCandidates,
  buildImageSet,
  buildJokeContextSnapshot,
  buildNewsLinkedImages,
  buildVisualJokeSet,
  createMemorySavedRunStore,
  renderWorkspace,
} from "./workspace-test-utils";

describe("Workspace image generation", () => {
  test("renders the four-variation image set, modal navigation, and image downloads", async () => {
    const user = userEvent.setup();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            completedAt: "2026-06-05T10:23:00.000Z",
            selectedImageId: newsLinkedImages[0].id,
            startedAt: "2026-06-05T10:20:00.000Z",
            status: "completed",
            userImagePrompt: "Make it feel like a serious product launch image.",
          },
          imageModelProvenance: imageSet.imageModelProvenance,
          imageSet,
          newsLinkedImages: newsLinkedImages.slice(0, 1),
          phase: "image-generation-complete",
          selectedImageOriginal: imageSet.selectedImageOriginal,
        }),
      ],
    });

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });
    const imageResultsArea = within(imageGenerationArea).getByRole("region", {
      name: /image results area/i,
    });

    expect(imageGenerationArea).toHaveTextContent(imageSet.imageModelProvenance.model);

    const imageSetArticle = within(imageResultsArea).getByRole("article", {
      name: /^image set$/i,
    });

    expect(imageSetArticle).toHaveTextContent("Original");
    expect(imageResultsArea).toHaveTextContent("Variation 1");
    expect(imageResultsArea).toHaveTextContent("Variation 2");
    expect(imageResultsArea).toHaveTextContent("Variation 3");
    expect(imageResultsArea).toHaveTextContent("Variation 4");
    // The Selected Image Original is locked: there is no re-original action on a generated set.
    expect(
      within(imageGenerationArea).queryByRole("button", {
        name: /as the image original/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(imageResultsArea).getByRole("link", {
        name: /^download original$/i,
      }),
    ).toHaveAttribute("href", imageSet.options[0].url);

    await user.click(
      within(imageResultsArea).getByRole("button", {
        name: /^open original$/i,
      }),
    );

    const dialog = screen.getByRole("dialog", {
      name: /original image option/i,
    });

    expect(
      within(dialog).getByRole("link", {
        name: /download current image option/i,
      }),
    ).toHaveAttribute("href", imageSet.options[0].url);

    await user.click(
      within(dialog).getByRole("button", {
        name: /next image option/i,
      }),
    );

    expect(
      screen.getByRole("dialog", {
        name: /variation 1 image option/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", {
        name: /download current image option/i,
      }),
    ).toHaveAttribute("href", imageSet.options[1].url);

    await user.click(
      screen.getByRole("button", {
        name: /previous image option/i,
      }),
    );

    expect(
      screen.getByRole("dialog", {
        name: /original image option/i,
      }),
    ).toBeInTheDocument();
  });

  test("renders a failed image state with quiet failure details", async () => {
    const user = userEvent.setup();
    const newsLinkedImages = buildNewsLinkedImages();
    const failedImageSet = buildFailedImageSet(newsLinkedImages[0]);

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          failedImageSet,
          imageGenerationState: {
            completedAt: "2026-06-05T10:23:00.000Z",
            selectedImageId: newsLinkedImages[0].id,
            startedAt: "2026-06-05T10:20:00.000Z",
            status: "failed",
            userImagePrompt: "Make it feel like a serious product launch image.",
          },
          newsLinkedImages: newsLinkedImages.slice(0, 1),
          phase: "image-generation-failed",
        }),
      ],
    });

    const imageResultsArea = screen.getByRole("region", {
      name: /image results area/i,
    });
    const failedState = within(imageResultsArea).getByRole("article", {
      name: /^failed image set$/i,
    });

    expect(failedState).toHaveTextContent("This image set could not be generated.");
    expect(failedState).not.toHaveTextContent("The configured image model failed.");
    expect(within(failedState).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(imageResultsArea).queryByRole("article", { name: /^image set$/i }),
    ).not.toBeInTheDocument();

    await user.click(
      within(failedState).getByRole("button", {
        name: /open quiet failure details for failed image set/i,
      }),
    );

    expect(screen.getByRole("dialog", { name: /quiet failure details/i })).toHaveTextContent(
      "The configured image model failed.",
    );
  });

  test("streams image generation results into the active run", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);
    const jokeContextSnapshot = buildJokeContextSnapshot("1234567890");
    const visualJokeSet = buildVisualJokeSet();
    const selectedVisualJoke = {
      selectedAt: "2026-06-06T10:16:00.000Z",
      visualJokeId: visualJokeSet.jokes[1].id,
    };
    const imageGenerationStreamFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        buildImageGenerationStreamResponse([
          {
            type: "image-set-completed",
            imageSet,
          },
          {
            type: "image-generation-completed",
            state: {
              completedAt: "2026-06-05T10:23:00.000Z",
              imageSet,
              status: "completed",
            },
          },
        ]),
    );

    renderWorkspace({
      imageGenerationStreamFetcher,
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            status: "not-started",
          },
          jokeContextSnapshot,
          newsLinkedImages,
          phase: "waiting-for-image-selection",
          selectedVisualJoke,
          usersDirection: "Keep the text skeptical about platform risk.",
          visualJokeDirection: "Internal visual joke direction.",
          visualJokeSet,
        }),
      ],
      savedRunStore,
    });

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /open image direction/i,
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: /user image prompt/i,
      }),
      "Make it feel like a serious product launch image.",
    );
    await user.click(
      screen.getByRole("button", {
        name: /close image direction/i,
      }),
    );
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /^start image generation$/i,
      }),
    );

    expect(imageGenerationStreamFetcher).toHaveBeenCalledWith(
      "/api/generation-runs/image-generation/stream",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(
      JSON.parse(String(imageGenerationStreamFetcher.mock.calls[0]?.[1]?.body)).parentRun
        .imageGenerationState,
    ).toEqual({
      status: "not-started",
    });
    expect(JSON.parse(String(imageGenerationStreamFetcher.mock.calls[0]?.[1]?.body))).toEqual({
      input: {
        parentRunId: "saved-run",
        selectedImageId: "news-linked-image-1",
        userImagePrompt: "Make it feel like a serious product launch image.",
      },
      parentRun: {
        id: "saved-run",
        imageGenerationState: {
          status: "not-started",
        },
        imageOriginalCandidates: buildImageOriginalCandidates(),
        phase: "waiting-for-image-selection",
      },
    });
    expect(JSON.stringify(imageGenerationStreamFetcher.mock.calls[0]?.[1]?.body)).not.toMatch(
      /jokeContextSnapshot|visualJokeDirection|visualJokeSet|selectedVisualJoke|platform risk/i,
    );
    await waitFor(() =>
      expect(
        within(imageGenerationArea).getByRole("region", {
          name: /image results area/i,
        }),
      ).toHaveTextContent("Variation 4"),
    );
    expect(imageGenerationArea).toHaveTextContent("Image generation complete");
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          imageGenerationState: expect.objectContaining({
            status: "completed",
          }),
          imageSet,
          jokeContextSnapshot,
          phase: "image-generation-complete",
          selectedVisualJoke,
          visualJokeDirection: "Internal visual joke direction.",
          visualJokeSet,
        }),
      ),
    );
  });

  test("persists image-generation progress before the terminal stream event", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    const imageGenerationStreamFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(
          new ReadableStream({
            start(controller) {
              streamController = controller;
            },
          }),
          {
            headers: {
              "Content-Type": "text/event-stream",
            },
          },
        ),
    );

    renderWorkspace({
      imageGenerationStreamFetcher,
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            status: "not-started",
          },
          newsLinkedImages,
          phase: "waiting-for-image-selection",
        }),
      ],
      savedRunStore,
    });

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /open image direction/i,
      }),
    );
    await user.type(
      screen.getByRole("textbox", {
        name: /user image prompt/i,
      }),
      "Make it feel like a serious product launch image.",
    );
    await user.click(
      screen.getByRole("button", {
        name: /close image direction/i,
      }),
    );
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /^start image generation$/i,
      }),
    );

    await waitFor(() => expect(streamController).toBeDefined());

    act(() => {
      streamController?.enqueue(
        encoder.encode(
          `event: image-set-completed\ndata: ${JSON.stringify({
            type: "image-set-completed",
            imageSet,
          })}\n\n`,
        ),
      );
    });

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          imageModelProvenance: imageSet.imageModelProvenance,
          imageSet,
          phase: "image-generation-running",
          selectedImageOriginal: imageSet.selectedImageOriginal,
        }),
      ),
    );

    act(() => {
      streamController?.close();
    });
  });

  test("persists exactly one selected generated variation across the four variations via autosave", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            completedAt: "2026-06-05T10:23:00.000Z",
            selectedImageId: newsLinkedImages[0].id,
            startedAt: "2026-06-05T10:20:00.000Z",
            status: "completed",
            userImagePrompt: "Make it feel like a serious product launch image.",
          },
          imageModelProvenance: imageSet.imageModelProvenance,
          imageSet,
          newsLinkedImages: newsLinkedImages.slice(0, 1),
          phase: "image-generation-complete",
          selectedImageOriginal: imageSet.selectedImageOriginal,
        }),
      ],
      savedRunStore,
    });

    const imageResultsArea = screen.getByRole("region", {
      name: /image results area/i,
    });

    // The original is locked and never selectable.
    expect(
      within(imageResultsArea).queryByRole("button", {
        name: /^select original$/i,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(imageResultsArea).getByRole("button", {
        name: /^select variation 1$/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");

    await user.click(
      within(imageResultsArea).getByRole("button", {
        name: /^select variation 1$/i,
      }),
    );

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedGeneratedImage: expect.objectContaining({
            imageOptionId: "image-option-news-linked-image-1-variation-1",
          }),
        }),
      ),
    );
    expect(
      within(imageResultsArea).getByRole("button", {
        name: /clear variation 1 selection/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      within(imageResultsArea).getByRole("button", {
        name: /^select variation 3$/i,
      }),
    );

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedGeneratedImage: expect.objectContaining({
            imageOptionId: "image-option-news-linked-image-1-variation-3",
          }),
        }),
      ),
    );
    expect(
      within(imageResultsArea).getByRole("button", {
        name: /^select variation 1$/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(within(imageResultsArea).getAllByRole("button", { pressed: true })).toHaveLength(1);

    await user.click(
      within(imageResultsArea).getByRole("button", {
        name: /clear variation 3 selection/i,
      }),
    );

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedGeneratedImage: null,
        }),
      ),
    );
    expect(savedRunStore.save.mock.calls.at(-1)?.[0].selectedGeneratedImage).toBeNull();
    expect(within(imageResultsArea).queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });

  test("reserves the image results footprint with a skeleton set while generation runs", () => {
    const newsLinkedImages = buildNewsLinkedImages();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            selectedImageId: newsLinkedImages[0].id,
            startedAt: "2026-06-05T10:20:00.000Z",
            status: "running",
            userImagePrompt: "Keep the image polished.",
          },
          newsLinkedImages: newsLinkedImages.slice(0, 1),
          phase: "image-generation-running",
        }),
      ],
    });

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    expect(within(imageGenerationArea).getByLabelText(/pending image set/i)).toBeInTheDocument();
    expect(within(imageGenerationArea).queryByLabelText(/^image set$/i)).not.toBeInTheDocument();
  });

  test("surfaces the used image prompt read-only once generation has run", async () => {
    const user = userEvent.setup();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            completedAt: "2026-06-05T10:23:00.000Z",
            selectedImageId: newsLinkedImages[0].id,
            startedAt: "2026-06-05T10:20:00.000Z",
            status: "completed",
            userImagePrompt: "Make it feel like a serious product launch image.",
          },
          imageModelProvenance: imageSet.imageModelProvenance,
          imageSet,
          newsLinkedImages: newsLinkedImages.slice(0, 1),
          phase: "image-generation-complete",
          selectedImageOriginal: imageSet.selectedImageOriginal,
        }),
      ],
    });

    // Source selection is closed, but the direction button is still reachable.
    await user.click(screen.getByRole("button", { name: /open image direction/i }));

    const imageDirectionPanel = screen.getByRole("complementary", {
      name: /image direction/i,
    });

    expect(imageDirectionPanel).toHaveTextContent(
      "Make it feel like a serious product launch image.",
    );
    // Read-only: the prompt is shown, not editable.
    expect(within(imageDirectionPanel).queryByRole("textbox")).not.toBeInTheDocument();
  });
});
