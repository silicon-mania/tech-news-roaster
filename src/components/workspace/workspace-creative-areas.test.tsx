import "@testing-library/jest-dom/vitest";
import { act, cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  buildGenerationFailureEvent,
  buildGenerationRunStateEvent,
  defaultImagePrompt,
  parseVisualJokeSet,
  type VisualJokeSection,
  type VisualJokeSet,
} from "@/services/generation";
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
    expect(within(visualJokeArea).queryByText("(Recommended)")).not.toBeInTheDocument();
    expect(within(visualJokeArea).queryByText("#1")).not.toBeInTheDocument();
    expect(
      within(visualJokeArea).getByRole("button", {
        name: /select satire visual joke 1/i,
      }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(within(visualJokeArea).queryByRole("textbox")).not.toBeInTheDocument();
    expect(visualJokeArea).not.toHaveTextContent("status-theater");
    expect(visualJokeArea).not.toHaveTextContent("It turns productivity theatre");
    // The internal Top Pick reason is never rendered on the main surface.
    expect(visualJokeArea).not.toHaveTextContent("Sharpest satire angle.");

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /copy tech-positive visual joke 1/i,
      }),
    );

    expect(writeText).toHaveBeenCalledWith(
      "A workflow map where every exit arrow points back to the login screen.",
    );
    expect(await screen.findByText("Visual joke copied")).toBeInTheDocument();

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /select tech-positive visual joke 1/i,
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
        name: /clear tech-positive visual joke 1 selection/i,
      }),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      within(visualJokeArea).getByRole("button", {
        name: /clear tech-positive visual joke 1 selection/i,
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
    await user.type(userImagePromptField, "Make it feel like a serious product launch image.");
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
      userImagePrompt: "Make it feel like a serious product launch image.",
    });
  });

  test("groups jokes under the three section subheadings in direction order", () => {
    const visualJokeSet = buildSectionedVisualJokeSet({
      experimental: 1,
      satire: 2,
      techPositive: 2,
    });

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          selectedVisualJoke: null,
          visualJokeSet,
        }),
      ],
    });

    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });

    const subheadings = within(visualJokeArea).getAllByRole("heading", { level: 2 });
    expect(subheadings.map((heading) => heading.textContent)).toEqual([
      "Satire",
      "Tech-positive",
      "Experimental",
    ]);

    // Each section renders exactly its own jokes, addressable by section + order.
    expect(
      within(visualJokeArea).getAllByRole("article", { name: /^satire visual joke \d+$/i }),
    ).toHaveLength(2);
    expect(
      within(visualJokeArea).getAllByRole("article", { name: /^tech-positive visual joke \d+$/i }),
    ).toHaveLength(2);
    expect(
      within(visualJokeArea).getAllByRole("article", { name: /^experimental visual joke \d+$/i }),
    ).toHaveLength(1);
  });

  test("shows quiet ordered Top pick labels and never renders the reason", () => {
    const visualJokeSet = buildSectionedVisualJokeSet({
      experimental: 1,
      satire: 2,
      techPositive: 2,
      // Two ordered Top Picks across two different sections.
      topPickIds: ["tech-positive-joke-2", "satire-joke-1"],
    });

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          selectedVisualJoke: null,
          visualJokeSet,
        }),
      ],
    });

    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });

    // Exactly the two Top Picks carry the label, in their declared order.
    expect(within(visualJokeArea).getByText("Top pick 1")).toBeInTheDocument();
    expect(within(visualJokeArea).getByText("Top pick 2")).toBeInTheDocument();
    expect(within(visualJokeArea).queryByText("Top pick 3")).not.toBeInTheDocument();

    // The first Top Pick (tech-positive-joke-2) is the second tech-positive card.
    expect(
      within(
        within(visualJokeArea).getByRole("article", { name: /tech-positive visual joke 2/i }),
      ).getByText("Top pick 1"),
    ).toBeInTheDocument();
    expect(
      within(
        within(visualJokeArea).getByRole("article", { name: /satire visual joke 1/i }),
      ).getByText("Top pick 2"),
    ).toBeInTheDocument();

    // The internal reason is retained for inspection only, never rendered.
    expect(visualJokeArea).not.toHaveTextContent("Reason for");
  });

  test("selecting a joke in one section clears a selection in another section", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore();
    const visualJokeSet = buildSectionedVisualJokeSet({
      experimental: 1,
      satire: 2,
      techPositive: 2,
    });

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          selectedVisualJoke: null,
          visualJokeSet,
        }),
      ],
      savedRunStore,
    });

    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });

    await user.click(
      within(visualJokeArea).getByRole("button", { name: /select satire visual joke 1/i }),
    );

    await waitFor(() =>
      expect(
        within(visualJokeArea).getByRole("button", {
          name: /clear satire visual joke 1 selection/i,
        }),
      ).toHaveAttribute("aria-pressed", "true"),
    );

    // Picking an experimental joke moves the single Selected Visual Joke across
    // sections — the prior satire selection clears.
    await user.click(
      within(visualJokeArea).getByRole("button", { name: /select experimental visual joke 1/i }),
    );

    await waitFor(() =>
      expect(
        within(visualJokeArea).getByRole("button", {
          name: /clear experimental visual joke 1 selection/i,
        }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(
      within(visualJokeArea).getByRole("button", { name: /select satire visual joke 1/i }),
    ).toHaveAttribute("aria-pressed", "false");
    expect(within(visualJokeArea).getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  test("shows a per-section shortfall notice only under short sections", () => {
    const visualJokeSet = buildSectionedVisualJokeSet({
      experimental: 3,
      // A full satire section sits alongside two short sections.
      satire: 7,
      techPositive: 2,
    });

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          selectedVisualJoke: null,
          visualJokeSet,
        }),
      ],
    });

    const visualJokeArea = screen.getByRole("region", {
      name: /visual joke creative result area/i,
    });

    // The full satire section shows no shortfall; the short sections each do.
    const notices = within(visualJokeArea).getAllByText(/fewer sharp jokes/i);
    expect(notices).toHaveLength(2);
    expect(visualJokeArea).toHaveTextContent("Showing 2 of 7");
    expect(visualJokeArea).toHaveTextContent("Showing 3 of 7");
    expect(visualJokeArea).not.toHaveTextContent("Showing 7 of 7");
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

    // The tweet context button lives in the source-post card now.
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
    await user.click(directionButton);

    const directionPanel = screen.getByRole("complementary", {
      name: /visual joke direction/i,
    });

    expect(
      within(directionPanel).getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === "pre" && element.textContent === visualJokeDirection,
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /close visual joke direction/i,
      }),
    );
    await user.click(screen.getByRole("button", { name: /open visual joke direction/i }));

    expect(
      within(screen.getByRole("complementary", { name: /visual joke direction/i })).getByText(
        (_content, element) =>
          element?.tagName.toLowerCase() === "pre" && element.textContent === visualJokeDirection,
      ),
    ).toBeInTheDocument();
  });

  test("shows the run's direction read-only in the text generation direction panel", async () => {
    const user = userEvent.setup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedRun({
          usersDirection: "Keep the platform-risk angle sharp.",
          visualJokeSet: buildVisualJokeSet(),
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

// Build a valid categorized Visual Joke Set with controllable per-section counts,
// so the sectioned UI tests can exercise grouping, Top Picks, and shortfall
// notices without leaning on the smaller default fixture.
function buildSectionedVisualJokeSet({
  experimental,
  satire,
  techPositive,
  topPickIds,
}: {
  experimental: number;
  satire: number;
  techPositive: number;
  topPickIds?: string[];
}): VisualJokeSet {
  const jokes = [
    ...buildSectionJokes("satire", satire),
    ...buildSectionJokes("tech-positive", techPositive),
    ...buildSectionJokes("experimental", experimental),
  ];
  const topPicks = (topPickIds ?? (jokes[0] ? [jokes[0].id] : [])).map((visualJokeId) => ({
    reason: `Reason for ${visualJokeId}.`,
    visualJokeId,
  }));

  return parseVisualJokeSet({
    generatedAt: "2026-06-06T10:14:00.000Z",
    id: "visual-joke-set-custom",
    jokes,
    targetPerSection: 7,
    topPicks,
  });
}

function buildSectionJokes(section: VisualJokeSection, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `${section}-joke-${index + 1}`,
    order: index + 1,
    section,
    text: `${section} joke ${index + 1}.`,
  }));
}
