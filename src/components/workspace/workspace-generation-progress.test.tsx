import "@testing-library/jest-dom/vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import {
  buildCompletedGenerationRunEvents,
  buildEnrichmentCompletedEvent,
  buildGenerationRunStateEvent,
} from "@/services/generation";
import { buildFixtureTweetContext } from "@/services/tweet-retrieval";
import {
  buildCompletedV3Run,
  buildGenerationEvents,
  buildJokeContextSnapshot,
  buildNewsLinkedImages,
  createMemorySavedRunStore,
  type FakeGenerationEventSource,
  renderWorkspace,
} from "./workspace-test-utils";

describe("Workspace generation progress", () => {
  test("receives progressive SSE updates and reveals exactly three completed drafts", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
    });

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(screen.getByRole("button", { name: /open user's direction panel/i }));
    const usersDirectionInput = screen.getByRole("textbox", {
      name: /^user's direction$/i,
    });
    await user.type(usersDirectionInput, "Keep the joke dry.");
    await user.click(
      screen.getByRole("button", {
        name: /close user's direction panel/i,
      }),
    );
    await user.click(generateButton);

    const events = buildGenerationEvents({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "Keep the joke dry.",
    });

    expect(generationEventSources).toHaveLength(1);

    act(() => {
      generationEventSources[0]?.emit(events[0]);
    });

    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(
      screen.getByRole("button", {
        name: /drafts for 1234567890.*just now/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Text generation running")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close runs drawer/i }));
    const sourceTweetPreview = screen.getByRole("complementary", {
      name: /source tweet preview/i,
    });

    expect(sourceTweetPreview).toHaveTextContent("agent workspace");
    expect(sourceTweetPreview).not.toHaveTextContent("https://x.com");
    expect(sourceTweetPreview).not.toHaveTextContent("Silicon Mania");
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/local draft model/i)).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[1]);
      generationEventSources[0]?.emit(events[2]);
    });

    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "3/3",
    );
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[3]);
    });

    expect(generationEventSources[0]?.closed).toBe(true);
    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(
      screen.getByRole("button", {
        name: /drafts for 1234567890.*just now/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Completed")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Quote-tweet draft:/)).toHaveLength(3);
    expect(screen.getAllByText(/local draft model/i)).toHaveLength(3);
  });

  test("renders compact generation progress from run-state events without polling", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
    });
    const sourceTweetUrl = "https://x.com/siliconmania/status/2468";
    const tweetContext = buildFixtureTweetContext(sourceTweetUrl);

    await user.type(sourceTweetUrlInput, sourceTweetUrl);
    await user.click(generateButton);

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationRunStateEvent({
          generationResultStates: {
            contextGathering: {
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "running",
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
          label: "Drafts for 2468",
          sourceTweet: tweetContext.sourceTweet,
        }),
      );
    });

    const progress = screen.getByLabelText(/generation progress/i);

    expect(progress).toHaveTextContent("Context gathering");
    expect(progress).toHaveTextContent("Running");
    expect(progress).toHaveTextContent("Draft creation");
    expect(progress).toHaveTextContent("Queued");
    expect(progress).toHaveTextContent("Image generation");

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationRunStateEvent({
          generationResultStates: {
            contextGathering: {
              completedAt: "2026-06-06T10:10:00.000Z",
              jokeContextSnapshot: buildJokeContextSnapshot("2468"),
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "completed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              startedAt: "2026-06-06T10:10:02.000Z",
              status: "running",
            },
            textGeneration: {
              startedAt: "2026-06-06T10:10:01.000Z",
              status: "running",
            },
            visualJokeGeneration: {
              startedAt: "2026-06-06T10:10:03.000Z",
              status: "running",
            },
          },
          label: "Drafts for 2468",
          sourceTweet: tweetContext.sourceTweet,
        }),
      );
    });

    expect(progress).toHaveTextContent("Complete");
    expect(progress).toHaveTextContent("Image discovery");
    expect(progress).toHaveTextContent("Visual jokes");
    expect(progress).toHaveTextContent("Queued");

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationRunStateEvent({
          generationResultStates: {
            contextGathering: {
              completedAt: "2026-06-06T10:10:00.000Z",
              jokeContextSnapshot: buildJokeContextSnapshot("2468"),
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "completed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              completedAt: "2026-06-06T10:12:00.000Z",
              newsLinkedImages: buildNewsLinkedImages(),
              startedAt: "2026-06-06T10:10:02.000Z",
              status: "completed",
            },
            textGeneration: {
              startedAt: "2026-06-06T10:10:01.000Z",
              status: "running",
            },
            visualJokeGeneration: {
              startedAt: "2026-06-06T10:10:03.000Z",
              status: "running",
            },
          },
          label: "Drafts for 2468",
          sourceTweet: tweetContext.sourceTweet,
        }),
      );
    });

    const readyForImageGenerationProgress = screen.getByLabelText(/generation progress/i);

    expect(readyForImageGenerationProgress).toHaveTextContent("Not started");

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationRunStateEvent({
          generationResultStates: {
            contextGathering: {
              completedAt: "2026-06-06T10:10:00.000Z",
              jokeContextSnapshot: buildJokeContextSnapshot("2468"),
              startedAt: "2026-06-06T10:08:00.000Z",
              status: "completed",
            },
            imageGeneration: {
              status: "not-started",
            },
            newsLinkedImageDiscovery: {
              failedAt: "2026-06-06T10:12:00.000Z",
              message: "Image discovery failed.",
              startedAt: "2026-06-06T10:10:02.000Z",
              status: "failed",
            },
            textGeneration: {
              startedAt: "2026-06-06T10:10:01.000Z",
              status: "running",
            },
            visualJokeGeneration: {
              startedAt: "2026-06-06T10:10:03.000Z",
              status: "running",
            },
          },
          label: "Drafts for 2468",
          sourceTweet: tweetContext.sourceTweet,
        }),
      );
    });

    const imageDiscoveryFailedProgress = screen.getByLabelText(/generation progress/i);

    expect(imageDiscoveryFailedProgress).toHaveTextContent("Failed");
    expect(imageDiscoveryFailedProgress).toHaveTextContent("Unavailable");
  });

  test("renders the full v3 happy path as separated responsive creative result areas", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const completedV3Run = buildCompletedV3Run({
      imageGenerationState: {
        status: "not-started",
      },
      phase: "waiting-for-image-selection",
    });
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
    });

    if (!completedV3Run.sourceTweet) {
      throw new Error("Expected completed v3 fixture to include a Source Tweet.");
    }
    const sourceTweet = completedV3Run.sourceTweet;

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    act(() => {
      for (const event of buildCompletedGenerationRunEvents({
        run: {
          drafts: completedV3Run.drafts,
          generationResultStates: completedV3Run.generationResultStates,
          imageGenerationState: completedV3Run.imageGenerationState,
          jokeContextSnapshot: completedV3Run.jokeContextSnapshot,
          label: completedV3Run.label,
          newsLinkedImages: completedV3Run.newsLinkedImages,
          phase: completedV3Run.phase,
          selectedVisualJoke: completedV3Run.selectedVisualJoke,
          sourceTweet,
          visualJokeDirection: completedV3Run.visualJokeDirection,
          visualJokeSet: completedV3Run.visualJokeSet,
        },
      })) {
        generationEventSources[0]?.emit(event);
      }
    });

    const responsiveWorkspace = screen.getByLabelText(/responsive creative workspace/i);
    const draftStack = screen.getByRole("region", {
      name: /completed draft stack/i,
    });
    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });
    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    expect(responsiveWorkspace).not.toHaveClass("lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]");
    expect(
      draftStack.compareDocumentPosition(visualJokeArea) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      visualJokeArea.compareDocumentPosition(imageGenerationArea) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(draftStack).toHaveTextContent("Quote-tweet draft: first saved draft.");
    expect(visualJokeArea).toHaveTextContent(
      "A workflow map where every exit arrow points back to the login screen.",
    );
    expect(imageGenerationArea).toHaveTextContent("Launch visual");
    expect(imageGenerationArea).toHaveTextContent("Waiting for image selection");
  });

  test("unlocks image selection from enrichment while text generation keeps streaming", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });
    const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
    const tweetContext = buildFixtureTweetContext(sourceTweetUrl);
    const newsLinkedImages = buildNewsLinkedImages();

    await user.type(sourceTweetUrlInput, sourceTweetUrl);
    await user.click(generateButton);

    act(() => {
      generationEventSources[0]?.emit(
        buildEnrichmentCompletedEvent({
          sourceTweet: tweetContext.sourceTweet,
          newsLinkedImages,
        }),
      );
    });

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    expect(imageGenerationArea).toHaveTextContent("Launch visual");
    expect(imageGenerationArea).toHaveTextContent("Platform visual");
    expect(imageGenerationArea).toHaveTextContent("Text generation running");
    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "0/3",
    );
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(screen.getByTitle("Text generation running")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /close runs drawer/i }));

    const events = buildGenerationEvents({
      sourceTweetUrl,
      usersDirection: "",
    });

    act(() => {
      generationEventSources[0]?.emit(events[0]);
    });

    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "1/3",
    );
    expect(
      screen.getByRole("complementary", {
        name: /image generation area/i,
      }),
    ).toHaveTextContent("Launch visual");

    act(() => {
      generationEventSources[0]?.emit(events[1]);
      generationEventSources[0]?.emit(events[2]);
    });

    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "3/3",
    );
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[3]);
    });

    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", {
        name: /image generation area/i,
      }),
    ).toHaveTextContent("Waiting for image selection");
    expect(generateButton).toBeEnabled();
    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        imageGenerationState: {
          status: "not-started",
        },
        newsLinkedImages,
        phase: "waiting-for-image-selection",
      }),
    );

    await user.click(generateButton);

    expect(generationEventSources).toHaveLength(2);
  });
});
