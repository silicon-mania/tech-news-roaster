import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  buildGenerationFailureEvent,
  buildStubbedGenerationEvents,
  type GenerationStreamEvent,
} from "@/features/generation/generation-events";
import { buildFixtureTweetContext } from "@/features/tweet-retrieval/tweet-retrieval";
import {
  type GenerationIntake,
  type GenerationRun,
  IntakeWorkspace,
} from "./intake-workspace";
import type { SavedRunStore } from "./types";

class FakeGenerationEventSource {
  readonly listeners = new Map<
    "progress" | "completed" | "failed",
    ((message: MessageEvent<string>) => void)[]
  >();
  closed = false;

  addEventListener(
    type: "progress" | "completed" | "failed",
    listener: (message: MessageEvent<string>) => void,
  ) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  emit(event: GenerationStreamEvent) {
    const message = new MessageEvent(event.type, {
      data: JSON.stringify(event),
    });

    for (const listener of this.listeners.get(event.type) ?? []) {
      listener(message);
    }
  }
}

function renderWorkspace({
  generationEventSources = [],
  isDesktop = false,
  initialActiveRunId,
  initialRuns,
  onStartGenerationRun = vi.fn(),
  savedRunStore,
}: {
  generationEventSources?: FakeGenerationEventSource[];
  isDesktop?: boolean;
  initialActiveRunId?: string;
  initialRuns?: GenerationRun[];
  onStartGenerationRun?: (intake: GenerationIntake) => void;
  savedRunStore?: SavedRunStore;
} = {}) {
  const generationStreamUrls: string[] = [];

  stubDesktopMediaQuery(isDesktop);

  render(
    <IntakeWorkspace
      generationEventSourceFactory={(url) => {
        generationStreamUrls.push(url);
        const eventSource = new FakeGenerationEventSource();

        generationEventSources.push(eventSource);

        return eventSource;
      }}
      initialActiveRunId={initialActiveRunId}
      initialRuns={initialRuns}
      onStartGenerationRun={onStartGenerationRun}
      savedRunStore={savedRunStore}
    />,
  );

  return {
    sourceTweetUrlInput: screen.getByLabelText(/source tweet url/i),
    generateButton: screen.getByRole("button", { name: /^run$/i }),
    generationStreamUrls,
  };
}

function createMemorySavedRunStore(initialRuns: GenerationRun[] = []) {
  const savedRuns = new Map(initialRuns.map((run) => [run.id, run]));
  const save = vi.fn(async (run: GenerationRun) => {
    savedRuns.set(run.id, run);
  });
  const deleteRun = vi.fn(async (runId: string) => {
    savedRuns.delete(runId);
  });
  const store = {
    savedRuns,
    list: async () =>
      Array.from(savedRuns.values()).sort((left, right) => {
        const leftSavedAt = Date.parse(left.savedAt ?? "");
        const rightSavedAt = Date.parse(right.savedAt ?? "");

        return rightSavedAt - leftSavedAt;
      }),
    save,
    delete: deleteRun,
  };

  return store;
}

function stubDesktopMediaQuery(matches: boolean) {
  vi.stubGlobal("matchMedia", () => ({
    matches,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}

function buildCompletedRun(
  overrides: Partial<GenerationRun> = {},
): GenerationRun {
  const tweetContext = buildFixtureTweetContext(
    "https://x.com/siliconmania/status/1234567890",
  );

  return {
    id: "saved-run",
    label: "Saved run",
    sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
    usersDirection: "Keep it dry.",
    status: "completed",
    draftCount: 3,
    draftTarget: 3,
    sourceTweet: tweetContext.sourceTweet,
    drafts: [
      {
        id: "draft-openai",
        text: "Quote-tweet draft: first saved draft.",
        modelProvenance: "OpenAI stub model",
      },
      {
        id: "draft-anthropic",
        text: "Quote-tweet draft: second saved draft.",
        modelProvenance: "Anthropic stub model",
      },
      {
        id: "draft-google",
        text: "Quote-tweet draft: third saved draft.",
        modelProvenance: "Google stub model",
      },
    ],
    ...overrides,
  };
}

function buildGenerationEvents({
  sourceTweetUrl,
  usersDirection = "",
}: {
  sourceTweetUrl: string;
  usersDirection?: string;
}) {
  const tweetContext = buildFixtureTweetContext(sourceTweetUrl);

  return buildStubbedGenerationEvents({
    sourceTweet: tweetContext.sourceTweet,
    sourceTweetUrl,
    usersDirection,
  });
}

describe("IntakeWorkspace", () => {
  test("renders an almost empty draft-first shell before any run exists", () => {
    renderWorkspace();

    expect(
      screen.getByRole("heading", { name: "TECH NEWS ROASTER" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /primary intake bar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /empty draft canvas/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: /runs drawer/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /^user's direction$/i }),
    ).not.toBeInTheDocument();
  });

  test("submits a valid direct Source Tweet URL with optional User's Direction", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(
      sourceTweetUrlInput,
      " https://x.com/siliconmania/status/1234567890 ",
    );
    await user.click(
      screen.getByRole("button", { name: /open user's direction panel/i }),
    );
    const usersDirectionInput = screen.getByRole("textbox", {
      name: /^user's direction$/i,
    });
    await user.type(
      usersDirectionInput,
      "Make it sharper about platform risk.",
    );
    await user.click(
      screen.getByRole("button", {
        name: /close user's direction panel/i,
      }),
    );
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "Make it sharper about platform risk.",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Intake accepted.");
    expect(
      screen.getByRole("region", { name: /compressed intake bar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /generation waiting state/i }),
    ).toHaveTextContent("0/3");

    await user.click(
      screen.getByRole("button", { name: /open runs drawer, 1 runs/i }),
    );
    expect(
      screen.getByRole("button", {
        name: /new generation run.*just now/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("running")).toBeInTheDocument();
    expect(generateButton).toBeDisabled();
  });

  test("rejects invalid URLs before generation starts", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(sourceTweetUrlInput, "https://example.com/posts/123");
    await user.click(generateButton);

    expect(startGenerationRun).not.toHaveBeenCalled();
    const intakeBar = screen.getByRole("region", {
      name: /primary intake bar/i,
    });
    expect(within(intakeBar).getByRole("alert")).toHaveTextContent(
      "Use a direct x.com or twitter.com status URL.",
    );
    expect(sourceTweetUrlInput).toHaveAttribute("aria-invalid", "true");
  });

  test("allows User's Direction to stay empty", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(
      sourceTweetUrlInput,
      "https://twitter.com/siliconmania/status/987654321",
    );
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://twitter.com/siliconmania/status/987654321",
      usersDirection: "",
    });
  });

  test("does not render preset steering controls", () => {
    renderWorkspace();

    expect(screen.queryByLabelText(/angle/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/draft's tone/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/length/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/language/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/publish mode/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/preset/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  test("opens the runs drawer and User's Direction panel from opposite sides on desktop and mobile-sized viewports", async () => {
    const user = userEvent.setup();

    vi.stubGlobal("innerWidth", 1280);
    renderWorkspace();

    await user.click(
      screen.getByRole("button", { name: /open runs drawer, 0 runs/i }),
    );
    expect(
      screen.getByRole("complementary", { name: /runs drawer/i }),
    ).toHaveClass("left-0");

    await user.click(
      screen.getByRole("button", { name: /close runs drawer/i }),
    );
    await user.click(
      screen.getByRole("button", { name: /open user's direction panel/i }),
    );
    expect(
      screen.getByRole("complementary", {
        name: /user's direction panel/i,
      }),
    ).toHaveClass("right-0");

    await user.type(
      screen.getByRole("textbox", { name: /^user's direction$/i }),
      "Respect the SEC angle.",
    );
    await user.click(
      screen.getByRole("button", {
        name: /close user's direction panel/i,
      }),
    );
    expect(
      screen.getByTitle("User's Direction has content"),
    ).toBeInTheDocument();

    vi.stubGlobal("innerWidth", 390);
    await user.click(
      screen.getByRole("button", { name: /open runs drawer, 0 runs/i }),
    );
    expect(
      screen.getByRole("complementary", { name: /runs drawer/i }),
    ).toBeInTheDocument();
  });

  test("keeps the running run inspectable and prevents another in-flight run", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(
      sourceTweetUrlInput,
      "https://x.com/siliconmania/status/1234567890",
    );
    await user.click(generateButton);

    await user.click(
      screen.getByRole("button", { name: /open runs drawer, 1 runs/i }),
    );
    expect(
      screen.getByRole("button", {
        name: /new generation run.*just now/i,
      }),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByTitle("running")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /generation waiting state/i }),
    ).toHaveTextContent("0/3");
    expect(generateButton).toBeDisabled();

    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledTimes(1);
  });

  test("selecting a run replaces the active run", async () => {
    const user = userEvent.setup();
    const seededRuns: GenerationRun[] = [
      {
        id: "first-run",
        label: "First run",
        sourceTweetUrl: "https://x.com/siliconmania/status/111",
        usersDirection: "",
        status: "running",
        draftCount: 0,
        draftTarget: 3,
        drafts: [],
      },
      {
        id: "second-run",
        label: "Second run",
        sourceTweetUrl: "https://x.com/siliconmania/status/222",
        usersDirection: "Lean into the business model.",
        status: "running",
        draftCount: 1,
        draftTarget: 3,
        drafts: [],
      },
    ];

    renderWorkspace({
      initialActiveRunId: "first-run",
      initialRuns: seededRuns,
    });

    expect(
      screen.getByRole("region", { name: /compressed intake bar/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /generation waiting state/i }),
    ).toHaveTextContent("0/3");

    await user.click(
      screen.getByRole("button", { name: /open runs drawer, 2 runs/i }),
    );
    await user.click(screen.getByRole("button", { name: /second run/i }));

    expect(
      screen.getByRole("region", { name: /generation waiting state/i }),
    ).toHaveTextContent("1/3");
    expect(
      screen.queryByRole("complementary", { name: /runs drawer/i }),
    ).not.toBeInTheDocument();
  });

  test("receives progressive SSE updates and reveals exactly three completed drafts", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
    });

    await user.type(
      sourceTweetUrlInput,
      "https://x.com/siliconmania/status/1234567890",
    );
    await user.click(
      screen.getByRole("button", { name: /open user's direction panel/i }),
    );
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

    await user.click(
      screen.getByRole("button", { name: /open runs drawer, 1 runs/i }),
    );
    expect(
      screen.getByRole("button", {
        name: /drafts for 1234567890.*just now/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("running")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /close runs drawer/i }),
    );
    const sourceTweetPreview = screen.getByRole("complementary", {
      name: /source tweet preview/i,
    });

    expect(sourceTweetPreview).toHaveTextContent("agent workspace");
    expect(sourceTweetPreview).not.toHaveTextContent("https://x.com");
    expect(sourceTweetPreview).not.toHaveTextContent("Silicon Mania");
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/OpenAI stub model/i)).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[1]);
      generationEventSources[0]?.emit(events[2]);
    });

    expect(
      screen.getByRole("region", { name: /generation waiting state/i }),
    ).toHaveTextContent("3/3");
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[3]);
    });

    expect(generationEventSources[0]?.closed).toBe(true);
    await user.click(
      screen.getByRole("button", { name: /open runs drawer, 1 runs/i }),
    );
    expect(
      screen.getByRole("button", {
        name: /drafts for 1234567890.*just now/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("completed")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /completed draft stack/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Quote-tweet draft:/)).toHaveLength(3);
    expect(screen.getAllByText(/stub model/i)).toHaveLength(3);
  });

  test("opens the generation stream with the accepted intake", async () => {
    const user = userEvent.setup();
    const { sourceTweetUrlInput, generateButton, generationStreamUrls } =
      renderWorkspace();

    await user.type(
      sourceTweetUrlInput,
      "https://x.com/siliconmania/status/13579",
    );
    await user.click(
      screen.getByRole("button", { name: /open user's direction panel/i }),
    );
    const usersDirectionInput = screen.getByRole("textbox", {
      name: /^user's direction$/i,
    });
    await user.type(usersDirectionInput, "Challenge the premise.");
    await user.click(
      screen.getByRole("button", {
        name: /close user's direction panel/i,
      }),
    );
    await user.click(generateButton);

    expect(generationStreamUrls).toEqual([
      "/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F13579&usersDirection=Challenge+the+premise.",
    ]);
  });

  test("automatically saves every completed Generation Run", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });

    await user.type(
      sourceTweetUrlInput,
      "https://x.com/siliconmania/status/1234567890",
    );
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
        id: "run-1",
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

    await user.click(
      screen.getByRole("button", { name: /open runs drawer, 1 runs/i }),
    );
    expect(
      screen.getByRole("button", {
        name: /drafts for 1234567890.*just now/i,
      }),
    ).toBeInTheDocument();
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
        name: /open runs drawer, 1 runs/i,
      }),
    );
    await user.click(
      screen.getByRole("button", {
        name: /previously saved run.*just now/i,
      }),
    );

    expect(generationStreamUrls).toEqual([]);
    expect(sourceTweetUrlInput).toHaveValue(
      "https://x.com/siliconmania/status/1234567890",
    );
    expect(
      screen.getByRole("region", { name: /completed draft stack/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("complementary", {
        name: /source tweet preview/i,
      }),
    ).toHaveTextContent("agent workspace");
    expect(screen.getAllByText(/Quote-tweet draft:/)).toHaveLength(3);
  });

  test("shows retrieval failure feedback without saving a completed run", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const savedRunStore = createMemorySavedRunStore();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      generationEventSources,
      savedRunStore,
    });

    await user.type(
      sourceTweetUrlInput,
      "https://x.com/siliconmania/status/1234567890",
    );
    await user.click(generateButton);

    act(() => {
      generationEventSources[0]?.emit(
        buildGenerationFailureEvent("Source tweet could not be retrieved."),
      );
    });

    expect(generationEventSources[0]?.closed).toBe(true);
    expect(
      screen.getByRole("region", { name: /generation failure state/i }),
    ).toHaveTextContent("Source tweet could not be retrieved.");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Source tweet could not be retrieved.",
    );
    expect(savedRunStore.save).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("region", { name: /completed draft stack/i }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /open runs drawer, 1 runs/i }),
    );
    expect(screen.getByTitle("failed")).toBeInTheDocument();
  });

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
      within(collapsedSecondDraft).getByText(
        "Quote-tweet draft: second saved draft.",
      ),
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
      name: /open runs drawer, 1 runs/i,
    });
    await user.clear(sourceTweetUrlInput);
    await user.type(
      sourceTweetUrlInput,
      "https://x.com/siliconmania/status/1234567890",
    );
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
    expect(savedRunStore.savedRuns.has("run-1")).toBe(true);
    expect(savedRunStore.savedRuns.get("run-1")).toEqual(
      expect.objectContaining({
        sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
        usersDirection: "",
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
        name: /open runs drawer, 1 runs/i,
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /open runs drawer, 1 runs/i }),
    );
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
        name: /open runs drawer, 1 runs/i,
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

    await waitFor(() =>
      expect(savedRunStore.delete).toHaveBeenCalledWith("saved-run"),
    );
    expect(
      screen.queryByRole("button", {
        name: /disposable run/i,
      }),
    ).not.toBeInTheDocument();
  });

  test("omits the delete affordance on mobile", async () => {
    const user = userEvent.setup();
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedRun({ label: "Mobile saved run" }),
    ]);

    renderWorkspace({ isDesktop: false, savedRunStore });

    await user.click(
      await screen.findByRole("button", {
        name: /open runs drawer, 1 runs/i,
      }),
    );

    expect(
      screen.queryByRole("button", {
        name: /delete saved run: mobile saved run/i,
      }),
    ).not.toBeInTheDocument();
  });
});
