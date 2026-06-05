import "@testing-library/jest-dom/vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  buildStubbedGenerationEvents,
  type GenerationStreamEvent,
} from "@/features/generation/generation-events";
import {
  type GenerationIntake,
  type GenerationRun,
  IntakeWorkspace,
} from "./intake-workspace";

class FakeGenerationEventSource {
  readonly listeners = new Map<
    "progress" | "completed",
    ((message: MessageEvent<string>) => void)[]
  >();
  closed = false;

  addEventListener(
    type: "progress" | "completed",
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
  initialActiveRunId,
  initialRuns,
  onStartGenerationRun = vi.fn(),
}: {
  generationEventSources?: FakeGenerationEventSource[];
  initialActiveRunId?: string;
  initialRuns?: GenerationRun[];
  onStartGenerationRun?: (intake: GenerationIntake) => void;
} = {}) {
  const generationStreamUrls: string[] = [];

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
    />,
  );

  return {
    sourceTweetUrlInput: screen.getByLabelText(/source tweet url/i),
    generateButton: screen.getByRole("button", { name: /^run$/i }),
    generationStreamUrls,
  };
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
        name: /new generation run.*running.*0\/3 drafts/i,
      }),
    ).toBeInTheDocument();
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
        name: /new generation run.*running.*0\/3 drafts/i,
      }),
    ).toHaveAttribute("aria-current", "true");
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

    const events = buildStubbedGenerationEvents({
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
        name: /drafts for 1234567890.*running.*1\/3 drafts/i,
      }),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /close runs drawer/i }),
    );
    expect(
      screen.queryByRole("region", { name: /completed draft comparison/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Model Provenance:/i)).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[1]);
      generationEventSources[0]?.emit(events[2]);
    });

    expect(
      screen.getByRole("region", { name: /generation waiting state/i }),
    ).toHaveTextContent("3/3");
    expect(
      screen.queryByRole("region", { name: /completed draft comparison/i }),
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
        name: /drafts for 1234567890.*complete.*3\/3 drafts/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: /completed draft comparison/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(/Quote-tweet draft:/)).toHaveLength(3);
    expect(screen.getAllByText(/Model Provenance:/)).toHaveLength(3);
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
});
