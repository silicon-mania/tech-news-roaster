import "@testing-library/jest-dom/vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { buildGenerationFailureEvent, buildGenerationRunStateEvent } from "@/services/generation";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import {
  buildCompletedRun,
  buildJokeContextSnapshot,
  buildNewsLinkedImages,
  buildVisualJokeSet,
  createMemorySavedRunStore,
  type FakeGenerationEventSource,
  renderWorkspace,
} from "./workspace-test-utils";

describe("Workspace creative result areas", () => {
  test("gates image generation on selected image IDs and the user image prompt", async () => {
    const user = userEvent.setup();
    const startImageGeneration = vi.fn();
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();

    renderWorkspace({
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
      onStartImageGeneration: startImageGeneration,
      savedRunStore,
    });

    const draftStack = screen.getByRole("region", {
      name: /completed draft stack/i,
    });
    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });
    const imageGenerationButton = within(imageGenerationArea).getByRole("button", {
      name: /^image generation$/i,
    });

    expect(
      draftStack.compareDocumentPosition(imageGenerationArea) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(imageGenerationButton).toBeDisabled();

    await user.type(
      within(imageGenerationArea).getByRole("textbox", {
        name: /user image prompt/i,
      }),
      "Make it feel like a serious product launch, not a meme.",
    );

    expect(imageGenerationButton).toBeDisabled();

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
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select strategy visual/i,
      }),
    );

    expect(imageGenerationArea).toHaveTextContent("Choose up to two images.");
    expect(
      within(imageGenerationArea).getByRole("button", {
        name: /select strategy visual/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(imageGenerationButton).toBeEnabled();

    await user.click(imageGenerationButton);

    expect(startImageGeneration).toHaveBeenCalledWith({
      parentRunId: "saved-run",
      selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
      userImagePrompt: "Make it feel like a serious product launch, not a meme.",
    });
    expect(JSON.stringify(startImageGeneration.mock.calls[0]?.[0])).not.toMatch(
      /picsum|Launch product screenshot|Platform update chart/i,
    );
    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        imageGenerationState: expect.objectContaining({
          selectedImageIds: ["news-linked-image-1", "news-linked-image-2"],
          status: "running",
          userImagePrompt: "Make it feel like a serious product launch, not a meme.",
        }),
        newsLinkedImages: newsLinkedImages.slice(0, 2),
        phase: "image-generation-running",
      }),
    );
  });

  test("renders visual jokes as copyable optional selections without exposing metadata or gating images", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    const startImageGeneration = vi.fn();
    const savedRunStore = createMemorySavedRunStore();
    const newsLinkedImages = buildNewsLinkedImages();
    const visualJokeSet = buildVisualJokeSet();

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          imageGenerationState: {
            status: "not-started",
          },
          newsLinkedImages,
          phase: "waiting-for-image-selection",
          selectedVisualJoke: null,
          visualJokeSet,
        }),
      ],
      onStartImageGeneration: startImageGeneration,
      savedRunStore,
    });

    const draftStack = screen.getByRole("region", {
      name: /completed draft stack/i,
    });
    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });
    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    expect(
      draftStack.compareDocumentPosition(visualJokeArea) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      visualJokeArea.compareDocumentPosition(imageGenerationArea) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(within(visualJokeArea).getAllByRole("article")).toHaveLength(5);
    expect(within(visualJokeArea).getByText("(Recommended)")).toBeInTheDocument();
    expect(
      within(visualJokeArea).getByRole("button", {
        name: /select visual joke 1/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(within(visualJokeArea).queryByRole("textbox")).not.toBeInTheDocument();
    expect(visualJokeArea).not.toHaveTextContent("status-theater");
    expect(visualJokeArea).not.toHaveTextContent("It turns productivity theatre");

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /copy visual joke 2/i,
      }),
    );

    expect(writeText).toHaveBeenCalledWith(
      "A workflow map where every exit arrow points back to the login screen.",
    );
    expect(await screen.findByText("Visual joke copied")).toBeInTheDocument();

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /select visual joke 2/i,
      }),
    );

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedVisualJoke: expect.objectContaining({
            visualJokeId: "visual-joke-2",
          }),
          visualJokeSet,
        }),
      ),
    );
    expect(savedRunStore.save.mock.calls.at(-1)?.[0].visualJokeSet).toBe(visualJokeSet);
    expect(
      within(visualJokeArea).getByRole("button", {
        name: /clear visual joke 2 selection/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /clear visual joke 2 selection/i,
      }),
    );

    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedVisualJoke: null,
          visualJokeSet,
        }),
      ),
    );
    expect(savedRunStore.save.mock.calls.at(-1)?.[0].visualJokeSet).toBe(visualJokeSet);

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
        name: /^image generation$/i,
      }),
    );

    expect(startImageGeneration).toHaveBeenCalledWith({
      parentRunId: "saved-run",
      selectedImageIds: ["news-linked-image-1"],
      userImagePrompt: "Make it feel like a serious product launch image.",
    });
  });

  test("opens quiet context and direction reveals without turning context into a control surface", async () => {
    const user = userEvent.setup();
    const jokeContextSnapshot = buildJokeContextSnapshot("1234567890");
    const visualJokeDirection =
      "Visual Joke Direction line one.\nPreserve this exact internal direction.";

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          jokeContextSnapshot,
          visualJokeDirection,
          visualJokeSet: buildVisualJokeSet(),
        }),
      ],
    });

    const draftStack = screen.getByRole("region", {
      name: /completed draft stack/i,
    });
    const directionButton = screen.getByRole("button", {
      name: /open visual joke direction/i,
    });

    expect(screen.queryByText(/^Direction$/)).not.toBeInTheDocument();
    expect(directionButton).toHaveTextContent("");
    expect(
      draftStack.compareDocumentPosition(directionButton) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(screen.getByRole("button", { name: /open joke context snapshot/i }));

    const contextDialog = screen.getByRole("dialog", {
      name: /joke context snapshot/i,
    });

    expect(contextDialog).toHaveTextContent("Source Tweet Claim");
    expect(contextDialog).toHaveTextContent(
      "The source tweet claims the launch removes the final workflow bottleneck.",
    );
    expect(contextDialog).toHaveTextContent("Jokeable Tensions");
    expect(contextDialog).not.toHaveTextContent(/approve|retry|repair/i);
    expect(within(contextDialog).queryByRole("textbox")).not.toBeInTheDocument();

    await user.click(
      within(contextDialog).getByRole("button", {
        name: /close joke context snapshot/i,
      }),
    );
    await user.click(directionButton);

    const directionDialog = screen.getByRole("dialog", {
      name: /visual joke direction/i,
    });

    expect(
      within(directionDialog).getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === "pre" && element.textContent === visualJokeDirection,
      ),
    ).toBeInTheDocument();

    await user.click(
      within(directionDialog).getByRole("button", {
        name: /close visual joke direction/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /open visual joke direction/i }));

    expect(
      within(screen.getByRole("dialog", { name: /visual joke direction/i })).getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === "pre" && element.textContent === visualJokeDirection,
      ),
    ).toBeInTheDocument();
  });

  test("keeps context and visual joke failure details behind quiet reveals", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
    });
    const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
    const tweetContext = buildFixtureTweetContext(sourceTweetUrl);

    await user.type(sourceTweetUrlInput, sourceTweetUrl);
    await user.click(generateButton);

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationRunStateEvent({
          generationResultStates: {
            contextGathering: {
              debugLog: ["Started fixture context gathering.", "Tweet text stayed too thin."],
              failedAt: "2026-06-06T10:10:00.000Z",
              message: "Joke context gathering could not form usable context.",
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "failed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              status: "not-started",
            },
            textGeneration: {
              status: "not-started",
            },
            visualJokeGeneration: {
              status: "not-started",
            },
          },
          label: "Drafts for 1234567890",
          sourceTweet: tweetContext.sourceTweet,
        }),
      );
      generationEventSources[0]?.emit(
        buildGenerationFailureEvent("Joke context gathering could not form usable context."),
      );
    });

    const failureState = screen.getByRole("region", {
      name: /generation failure state/i,
    });

    expect(failureState).toHaveTextContent("Joke context gathering could not form usable context.");
    expect(failureState).not.toHaveTextContent("Tweet text stayed too thin.");

    await user.click(
      within(failureState).getByRole("button", {
        name: /open joke context debug log/i,
      }),
    );

    expect(screen.getByRole("dialog", { name: /joke context debug log/i })).toHaveTextContent(
      "Tweet text stayed too thin.",
    );

    await user.click(screen.getByRole("button", { name: /close joke context debug log/i }));

    cleanup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          generationResultStates: {
            contextGathering: {
              completedAt: "2026-06-06T10:10:00.000Z",
              jokeContextSnapshot: buildJokeContextSnapshot("1234567890"),
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "completed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              status: "not-started",
            },
            textGeneration: {
              completedAt: "2026-06-06T10:13:00.000Z",
              draftCount: 3,
              startedAt: "2026-06-06T10:11:00.000Z",
              status: "completed",
            },
            visualJokeGeneration: {
              failedAt: "2026-06-06T10:14:00.000Z",
              message: "Visual joke generation hit a provider timeout.",
              startedAt: "2026-06-06T10:11:00.000Z",
              status: "failed",
            },
          },
        }),
      ],
    });

    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });

    expect(visualJokeArea).toHaveTextContent("This result area could not be completed.");
    expect(visualJokeArea).not.toHaveTextContent("provider timeout");

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /open visual joke failure details/i,
      }),
    );

    expect(screen.getByRole("dialog", { name: /visual joke failure details/i })).toHaveTextContent(
      "Visual joke generation hit a provider timeout.",
    );
  });

  test("keeps image discovery failure details behind a quiet image-work result area", async () => {
    const user = userEvent.setup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          generationResultStates: {
            contextGathering: {
              completedAt: "2026-06-06T10:10:00.000Z",
              jokeContextSnapshot: buildJokeContextSnapshot("1234567890"),
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "completed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              debugLog: ["Serper quota was exhausted before image results returned."],
              failedAt: "2026-06-06T10:12:00.000Z",
              message: "News-linked image discovery could not complete.",
              startedAt: "2026-06-06T10:11:00.000Z",
              status: "failed",
            },
            textGeneration: {
              completedAt: "2026-06-06T10:13:00.000Z",
              draftCount: 3,
              startedAt: "2026-06-06T10:11:00.000Z",
              status: "completed",
            },
            visualJokeGeneration: {
              completedAt: "2026-06-06T10:15:00.000Z",
              startedAt: "2026-06-06T10:11:00.000Z",
              status: "completed",
              visualJokeSet: buildVisualJokeSet(),
            },
          },
          imageGenerationState: {
            status: "not-started",
          },
          newsLinkedImages: undefined,
          phase: undefined,
          visualJokeSet: buildVisualJokeSet(),
        }),
      ],
    });

    const imageWorkArea = screen.getByRole("region", {
      name: /image work creative result area/i,
    });

    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /visual joke creative result area/i }),
    ).toBeInTheDocument();
    expect(imageWorkArea).toHaveTextContent("This result area could not be completed.");
    expect(imageWorkArea).not.toHaveTextContent("Serper quota");
    expect(imageWorkArea).not.toHaveTextContent("News-linked image discovery could not complete.");

    await user.click(
      within(imageWorkArea).getByRole("button", {
        name: /open image discovery failure details/i,
      }),
    );

    const detailsDialog = screen.getByRole("dialog", {
      name: /image discovery failure details/i,
    });

    expect(detailsDialog).toHaveTextContent("News-linked image discovery could not complete.");
    expect(detailsDialog).toHaveTextContent("Serper quota was exhausted");
  });
});
