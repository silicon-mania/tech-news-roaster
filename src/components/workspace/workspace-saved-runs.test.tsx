import "@testing-library/jest-dom/vitest";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  buildCompletedGenerationRunEvents,
  buildGenerationFailureEvent,
  defaultImagePrompt,
} from "@/services/generation";
import {
  buildCompletedRun,
  buildCompletedV3Run,
  buildGenerationEvents,
  buildNewsLinkedImages,
  createMemorySavedRunStore,
  type FakeGenerationEventSource,
  renderWorkspace,
} from "./workspace-test-utils";

describe("Workspace saved runs", () => {
  test("automatically saves every completed Generation Run", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    const events = buildGenerationEvents({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "",
    });

    act(() => {
      for (const event of events) {
        generationEventSources[0]?.emit(event);
      }
    });

    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: expect.stringMatching(/^run-/),
        label: "Drafts for 1234567890",
        sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
        status: "completed",
        draftCount: 3,
        sourceTweet: expect.objectContaining({
          text: expect.stringContaining("agent workspace"),
        }),
        savedAt: expect.any(String),
      }),
    );
    expect(sourceTweetUrlInput).toHaveValue("https://x.com/siliconmania/status/1234567890");

    await user.click(screen.getByRole("button", { name: /open runs, 1 saved/i }));
    expect(
      screen.getByRole("button", {
        name: /drafts for 1234567890.*just now/i,
      }),
    ).toBeInTheDocument();
  });

  test("automatically saves completed v3 runs with context, visual jokes, selection, image state, and independent result states", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore();
    const sourceTweetUrl = "https://x.com/siliconmania/status/1234567890";
    const completedV3Run = buildCompletedV3Run();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });

    await user.type(sourceTweetUrlInput, sourceTweetUrl);
    await user.click(generateButton);

    if (!completedV3Run.sourceTweet) {
      throw new Error("Expected completed v3 fixture to include a Source Tweet.");
    }

    const events = buildCompletedGenerationRunEvents({
      run: {
        drafts: completedV3Run.drafts,
        failedImageSet: completedV3Run.failedImageSet,
        generationResultStates: completedV3Run.generationResultStates,
        imageGenerationState: completedV3Run.imageGenerationState,
        imageModelProvenance: completedV3Run.imageModelProvenance,
        imageSet: completedV3Run.imageSet,
        jokeContextSnapshot: completedV3Run.jokeContextSnapshot,
        label: completedV3Run.label,
        newsLinkedImages: completedV3Run.newsLinkedImages,
        phase: completedV3Run.phase,
        selectedImageOriginal: completedV3Run.selectedImageOriginal,
        selectedVisualJoke: completedV3Run.selectedVisualJoke,
        sourceTweet: completedV3Run.sourceTweet,
        visualJokeDirection: completedV3Run.visualJokeDirection,
        visualJokeSet: completedV3Run.visualJokeSet,
      },
    });

    act(() => {
      for (const event of events) {
        generationEventSources[0]?.emit(event);
      }
    });

    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.save).toHaveBeenCalledWith(
      expect.objectContaining({
        drafts: completedV3Run.drafts,
        generationResultStates: completedV3Run.generationResultStates,
        imageGenerationState: completedV3Run.imageGenerationState,
        imageSet: completedV3Run.imageSet,
        jokeContextSnapshot: completedV3Run.jokeContextSnapshot,
        newsLinkedImages: completedV3Run.newsLinkedImages,
        selectedImageOriginal: completedV3Run.selectedImageOriginal,
        selectedVisualJoke: completedV3Run.selectedVisualJoke,
        visualJokeDirection: completedV3Run.visualJokeDirection,
        visualJokeSet: completedV3Run.visualJokeSet,
      }),
    );
  });

  test("reopens Saved Runs from the drawer without regenerating", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ label: "Previously saved run" }),
    ]);
    const { generationStreamUrls, sourceTweetUrlInput } = renderWorkspace({
      savedRunStore,
    });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /previously saved run.*just now/i,
      }),
    );

    expect(generationStreamUrls).toEqual([]);
    expect(sourceTweetUrlInput).toHaveValue("https://x.com/siliconmania/status/1234567890");
    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", {
        name: /source tweet preview/i,
      }),
    ).toHaveTextContent("agent workspace");
    expect(screen.getAllByText(/Quote-tweet draft:/)).toHaveLength(3);
  });

  test("reopens v3 Saved Runs with selected visual jokes, exact joke sets, the generated image set, and no regeneration", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const startImageGeneration = vi.fn();
    const imageGenerationStreamFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(""),
    );
    const savedRun = buildCompletedV3Run({
      label: "Persisted v3 run",
      usersDirection: "Keep the saved direction.",
    });
    const savedRunStore = createMemorySavedRunStore([savedRun]);
    const { generationStreamUrls, sourceTweetUrlInput } = renderWorkspace({
      imageGenerationStreamFetcher,
      onStartGenerationRun: startGenerationRun,
      onStartImageGeneration: startImageGeneration,
      savedRunStore,
    });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /persisted v3 run/i,
      }),
    );

    expect(generationStreamUrls).toEqual([]);
    expect(startGenerationRun).not.toHaveBeenCalled();
    expect(startImageGeneration).not.toHaveBeenCalled();
    expect(imageGenerationStreamFetcher).not.toHaveBeenCalled();
    expect(sourceTweetUrlInput).toHaveValue("https://x.com/siliconmania/status/1234567890");

    // A reopened run with a saved direction auto-reveals the inline field.
    expect(screen.getByRole("textbox", { name: /^user's direction$/i })).toHaveValue(
      "Keep the saved direction.",
    );

    await user.click(screen.getByRole("button", { name: /open tweet context/i }));
    expect(screen.getByRole("dialog", { name: /tweet context/i })).toHaveTextContent(
      "The source tweet claims the launch removes the final workflow bottleneck.",
    );
    await user.click(screen.getByRole("button", { name: /close tweet context/i }));

    await user.click(screen.getByRole("button", { name: /open visual joke direction/i }));
    expect(screen.getByRole("complementary", { name: /visual joke direction/i })).toHaveTextContent(
      "Ground every visual joke in the source media and lock-in replies.",
    );
    await user.click(screen.getByRole("button", { name: /close visual joke direction/i }));

    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });
    expect(within(visualJokeArea).getAllByRole("article")).toHaveLength(5);
    expect(
      within(visualJokeArea).getByRole("button", {
        name: /clear visual joke 2 selection/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(visualJokeArea).toHaveTextContent(
      "A launch graphic where confetti falls only on the terms-of-service checkbox.",
    );

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });
    const imageResultsArea = within(imageGenerationArea).getByRole("region", {
      name: /image results area/i,
    });
    expect(imageResultsArea).toHaveTextContent("Variation 4");
    expect(imageGenerationArea).toHaveTextContent("Image generation complete");
    // The single generated set completed — there is no failed image state.
    expect(
      within(imageResultsArea).queryByRole("article", { name: /^failed image set$/i }),
    ).not.toBeInTheDocument();
  });

  test("reopens text-successful Saved Runs with unstarted image generation still eligible", async () => {
    const user = userEvent.setup();
    const startImageGeneration = vi.fn();
    const newsLinkedImages = buildNewsLinkedImages();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({
        imageGenerationState: {
          status: "not-started",
        },
        label: "Image-ready saved run",
        newsLinkedImages,
        phase: "waiting-for-image-selection",
      }),
    ]);
    const { generationStreamUrls } = renderWorkspace({
      onStartImageGeneration: startImageGeneration,
      savedRunStore,
    });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /image-ready saved run.*just now/i,
      }),
    );

    const imageGenerationArea = screen.getByRole("complementary", {
      name: /image generation area/i,
    });

    expect(generationStreamUrls).toEqual([]);
    expect(imageGenerationArea).toHaveTextContent("Waiting for image selection");
    expect(imageGenerationArea).toHaveTextContent("Launch visual");

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
    const userImagePromptField = screen.getByRole("textbox", {
      name: /user image prompt/i,
    });
    expect(userImagePromptField).toHaveValue(defaultImagePrompt);
    await user.clear(userImagePromptField);
    await user.type(userImagePromptField, "Make the visual feel launch-ready.");
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

    expect(startImageGeneration).toHaveBeenCalledWith({
      parentRunId: "saved-run",
      selectedImageId: "news-linked-image-1",
      userImagePrompt: "Make the visual feel launch-ready.",
    });
  });

  test("shows retrieval failure feedback without saving a completed run", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationFailureEvent("Source tweet could not be retrieved."),
      );
    });

    expect(generationEventSources[0]?.closed).toBe(true);
    expect(screen.getByRole("region", { name: /generation failure state/i })).toHaveTextContent(
      "Source tweet could not be retrieved.",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Source tweet could not be retrieved.");
    expect(savedRunStore.save).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open runs, 1 saved/i }));
    expect(screen.getByTitle("Failed")).toBeInTheDocument();
  });

  test("reusing the same source tweet creates an independent Saved Run", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ id: "original-saved-run" }),
    ]);
    const { generateButton, sourceTweetUrlInput } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });

    await screen.findByRole("button", {
      name: /open runs, 1 saved/i,
    });
    await waitFor(() =>
      expect(sourceTweetUrlInput).toHaveValue("https://x.com/siliconmania/status/1234567890"),
    );
    await user.clear(sourceTweetUrlInput);
    await waitFor(() => expect(sourceTweetUrlInput).toHaveValue(""));
    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    const events = buildGenerationEvents({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "Keep it dry.",
    });

    act(() => {
      for (const event of events) {
        generationEventSources[0]?.emit(event);
      }
    });

    await waitFor(() => expect(savedRunStore.save).toHaveBeenCalledTimes(1));
    expect(savedRunStore.savedRuns.has("original-saved-run")).toBe(true);
    const newSavedRun = [...savedRunStore.savedRuns.values()].find(
      (savedRun) => savedRun.id !== "original-saved-run",
    );

    expect(newSavedRun).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^run-/),
        sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
        usersDirection: "Keep it dry.",
      }),
    );
  });

  test("renders saved-run relative dates", async () => {
    const dateNow = vi
      .spyOn(Date, "now")
      .mockReturnValue(new Date("2026-06-05T12:00:00.000Z").getTime());
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({
        label: "Three weeks old",
        savedAt: "2026-05-15T12:00:00.000Z",
      }),
    ]);

    renderWorkspace({ savedRunStore });

    const user = userEvent.setup();
    expect(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /open runs, 1 saved/i }));
    expect(
      screen.getByRole("button", {
        name: /three weeks old.*3 weeks ago/i,
      }),
    ).toBeInTheDocument();

    dateNow.mockRestore();
  });

  test("deletes saved runs through a desktop hover affordance", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ label: "Disposable run" }),
    ]);

    renderWorkspace({ isDesktop: true, savedRunStore });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    );
    await user.hover(
      screen.getByRole("button", {
        name: /disposable run.*just now/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /delete saved run: disposable run/i,
      }),
    );

    await waitFor(() => expect(savedRunStore.delete).toHaveBeenCalledWith("saved-run"));
    expect(
      screen.queryByRole("button", {
        name: /disposable run/i,
      }),
    ).not.toBeInTheDocument();
    expect(await screen.findByText("Saved run deleted")).toBeInTheDocument();
  });

  test("omits the delete affordance on mobile", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ label: "Mobile saved run" }),
    ]);

    renderWorkspace({ isDesktop: false, savedRunStore });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs, 1 saved/i,
      }),
    );

    expect(
      screen.queryByRole("button", {
        name: /delete saved run: mobile saved run/i,
      }),
    ).not.toBeInTheDocument();
  });
});
