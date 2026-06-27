import "@testing-library/jest-dom/vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { defaultImagePrompt } from "@/services/generation";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import {
  buildCompletedRun,
  buildFailedManualRun,
  buildJokeContextSnapshot,
  buildNewsLinkedImages,
  createMemorySavedRunStore,
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
      name: /^start image generation$/i,
    });

    expect(
      draftStack.compareDocumentPosition(imageGenerationArea) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(imageGenerationButton).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: /open image direction/i,
      }),
    );
    const userImagePromptField = screen.getByRole("textbox", {
      name: /user image prompt/i,
    });
    // The prompt is pre-seeded with the shared Default Image Prompt; the operator
    // can replace it before generation, and that edited value is what flows through.
    expect(userImagePromptField).toHaveValue(defaultImagePrompt);
    await user.clear(userImagePromptField);
    await user.type(
      userImagePromptField,
      "Make it feel like a serious product launch, not a meme.",
    );
    await user.click(
      screen.getByRole("button", {
        name: /close image direction/i,
      }),
    );

    expect(imageGenerationButton).toBeDisabled();

    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    );

    expect(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(imageGenerationButton).toBeEnabled();

    // Selecting another candidate replaces the choice — exactly one stays selected.
    await user.click(
      within(imageGenerationArea).getByRole("button", {
        name: /select platform visual/i,
      }),
    );

    expect(
      within(imageGenerationArea).getByRole("button", {
        name: /select launch visual/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      within(imageGenerationArea).getByRole("button", {
        name: /select platform visual/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(within(imageGenerationArea).getAllByRole("button", { pressed: true })).toHaveLength(1);

    await user.click(imageGenerationButton);

    expect(startImageGeneration).toHaveBeenCalledWith({
      parentRunId: "saved-run",
      selectedImageId: "news-linked-image-2",
      userImagePrompt: "Make it feel like a serious product launch, not a meme.",
    });
    expect(JSON.stringify(startImageGeneration.mock.calls[0]?.[0])).not.toMatch(
      /picsum|Launch product screenshot|Platform update chart/i,
    );
    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        imageGenerationState: expect.objectContaining({
          selectedImageId: "news-linked-image-2",
          status: "running",
          userImagePrompt: "Make it feel like a serious product launch, not a meme.",
        }),
        imageOriginalCandidates: [
          expect.objectContaining({ id: "news-linked-image-2", origin: "news-linked-image" }),
        ],
        phase: "image-generation-running",
      }),
    );
  });

  test("opens the quiet tweet-context reveal without turning context into a control surface", async () => {
    const user = userEvent.setup();
    const jokeContextSnapshot = buildJokeContextSnapshot("1234567890");

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          jokeContextSnapshot,
        }),
      ],
    });

    // The tweet context button lives in the source-post card.
    expect(
      within(screen.getByRole("complementary", { name: /source tweet preview/i })).getByRole(
        "button",
        { name: /open tweet context/i },
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open tweet context/i }));

    const contextDialog = screen.getByRole("dialog", {
      name: /tweet context/i,
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
        name: /close tweet context/i,
      }),
    );
  });

  test("shows the run's direction read-only in the text generation direction panel", async () => {
    const user = userEvent.setup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          newsLinkedImages: buildNewsLinkedImages(),
          usersDirection: "Keep the platform-risk angle sharp.",
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: /open text direction/i }));

    const textDirectionPanel = screen.getByRole("complementary", {
      name: /text direction/i,
    });

    expect(textDirectionPanel).toHaveTextContent("Keep the platform-risk angle sharp.");
    // The text-generation prompt is the run's "User's Direction" — read-only here.
    expect(within(textDirectionPanel).queryByRole("textbox")).not.toBeInTheDocument();
  });

  test("keeps context failure details behind a quiet reveal", async () => {
    const user = userEvent.setup();
    const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
    const tweetContext = buildFixtureTweetContext(sourceTweetUrl);

    // A Manual Run that failed at Joke Context Gathering is persisted as a failed
    // run carrying its Quiet Failure Details, so reopening it shows the reveal.
    renderWorkspace({
      initialActiveRunId: "context-failed-run",
      initialRuns: [
        buildFailedManualRun({
          id: "context-failed-run",
          sourceTweet: tweetContext.sourceTweet,
          failureMessage: "Joke context gathering could not form usable context.",
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
          },
        }),
      ],
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
          },
          imageGenerationState: {
            status: "not-started",
          },
          newsLinkedImages: undefined,
          phase: undefined,
        }),
      ],
    });

    const imageWorkArea = screen.getByRole("region", {
      name: /image work creative result area/i,
    });

    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
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
