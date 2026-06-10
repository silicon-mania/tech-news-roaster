import "@testing-library/jest-dom/vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  buildCompletedRun,
  buildFailedImageSet,
  buildImageGenerationStreamResponse,
  buildImageSet,
  buildJokeContextSnapshot,
  buildNewsLinkedImages,
  buildVisualJokeSet,
  createMemorySavedRunStore,
  renderWorkspace,
} from "./workspace-test-utils";

describe("Workspace image generation", () => {
  test("renders image sets, failed image states, modal navigation, and image downloads", async () => {
    const user = userEvent.setup();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);
    const failedImageSet = buildFailedImageSet(newsLinkedImages[1]);

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          failedImageSets: [failedImageSet],
          imageGenerationState: {
            completedAt: "2026-06-05T10:23:00.000Z",
            selectedImageIds: [newsLinkedImages[0].id, newsLinkedImages[1].id],
            startedAt: "2026-06-05T10:20:00.000Z",
            status: "partially-failed",
            userImagePrompt: "Make it feel like a serious product launch image.",
          },
          imageModelProvenance: imageSet.imageModelProvenance,
          imageSets: [imageSet],
          newsLinkedImages: newsLinkedImages.slice(0, 2),
          phase: "image-generation-partially-failed",
          selectedImageOriginals: [imageSet.selectedImageOriginal],
        }),
      ],
    });

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });
    const imageResultsArea = within(imageGenerationArea).getByRole("region", {
      name: /image results area/i,
    });
    const failedState = within(imageResultsArea).getByRole("article", {
      name: /failed image set 1/i,
    });

    expect(imageGenerationArea).toHaveTextContent(imageSet.imageModelProvenance.model);
    expect(
      within(imageResultsArea).getByRole("article", {
        name: /^image set 1$/i,
      }),
    ).toHaveTextContent("Original");
    expect(imageResultsArea).toHaveTextContent("Variation 1");
    expect(imageResultsArea).toHaveTextContent("Variation 2");
    expect(failedState).toHaveTextContent("This image set could not be generated.");
    expect(failedState).not.toHaveTextContent("The configured image model failed.");
    expect(within(failedState).queryByRole("link")).not.toBeInTheDocument();
    expect(
      within(imageResultsArea).getByRole("link", {
        name: /download original from image set 1/i,
      }),
    ).toHaveAttribute("href", imageSet.options[0].url);
    expect(
      screen.getByRole("button", {
        name: /copy draft 1/i,
      }),
    ).toBeInTheDocument();

    await user.click(
      within(failedState).getByRole("button", {
        name: /open quiet failure details for failed image set 1/i,
      }),
    );

    expect(screen.getByRole("dialog", { name: /quiet failure details/i })).toHaveTextContent(
      "The configured image model failed.",
    );

    await user.click(screen.getByRole("button", { name: /close quiet failure details/i }));

    await user.click(
      within(imageResultsArea).getByRole("button", {
        name: /open original from image set 1/i,
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

  test("streams image generation results into the active run", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();
    const imageSet = buildImageSet(newsLinkedImages[0]);
    const failedImageSet = buildFailedImageSet(newsLinkedImages[1]);
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
            type: "image-set-failed",
            failedImageSet,
          },
          {
            type: "image-generation-completed",
            state: {
              completedAt: "2026-06-05T10:23:00.000Z",
              failedImageSets: [failedImageSet],
              imageSets: [imageSet],
              status: "partially-failed",
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
      within(imageGenerationArea).getByRole("button", {
        name: /select platform visual/i,
      }),
    );
    await user.type(
      within(imageGenerationArea).getByRole("textbox", {
        name: /user image prompt/i,
      }),
      "Make it feel like a serious product launch image.",
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
        selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
        userImagePrompt: "Make it feel like a serious product launch image.",
      },
      parentRun: {
        id: "saved-run",
        imageGenerationState: {
          status: "not-started",
        },
        newsLinkedImages,
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
      ).toHaveTextContent("Variation 2"),
    );
    expect(imageGenerationArea).toHaveTextContent("Partial image failure");
    expect(imageGenerationArea).not.toHaveTextContent("The configured image model failed.");
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          failedImageSets: [failedImageSet],
          imageGenerationState: expect.objectContaining({
            status: "partially-failed",
          }),
          imageSets: [imageSet],
          jokeContextSnapshot,
          phase: "image-generation-partially-failed",
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
    await user.type(
      within(imageGenerationArea).getByRole("textbox", {
        name: /user image prompt/i,
      }),
      "Make it feel like a serious product launch image.",
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
          imageSets: [imageSet],
          phase: "image-generation-running",
          selectedImageOriginals: [imageSet.selectedImageOriginal],
        }),
      ),
    );

    act(() => {
      streamController?.close();
    });
  });
});
