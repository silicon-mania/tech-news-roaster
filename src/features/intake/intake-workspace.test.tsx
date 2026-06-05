import "@testing-library/jest-dom/vitest";
import { act, render, screen } from "@testing-library/react";
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
    usersDirectionInput: screen.getByLabelText(/user's direction/i),
    generateButton: screen.getByRole("button", { name: /generate drafts/i }),
    generationStreamUrls,
  };
}

describe("IntakeWorkspace", () => {
  test("submits a valid direct Source Tweet URL with optional User's Direction", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, usersDirectionInput, generateButton } =
      renderWorkspace({ onStartGenerationRun: startGenerationRun });

    await user.type(
      sourceTweetUrlInput,
      " https://x.com/siliconmania/status/1234567890 ",
    );
    await user.type(
      usersDirectionInput,
      "Make it sharper about platform risk.",
    );
    await user.click(generateButton);

    expect(startGenerationRun).toHaveBeenCalledWith({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "Make it sharper about platform risk.",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Intake accepted.");
    expect(
      screen.getByRole("button", {
        name: /new generation run.*running.*0\/3 drafts/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "New generation run" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Tracking provider drafts as they arrive."),
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
    expect(screen.getByRole("alert")).toHaveTextContent(
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

    expect(
      screen.getByRole("button", {
        name: /new generation run.*running.*0\/3 drafts/i,
      }),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByText("0/3")).toBeInTheDocument();
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
      screen.getByRole("heading", { name: "First run" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /second run/i }));

    expect(
      screen.getByRole("heading", { name: "Second run" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://x.com/siliconmania/status/222"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Lean into the business model."),
    ).toBeInTheDocument();
  });

  test("receives progressive SSE updates and reveals exactly three completed drafts", async () => {
    const user = userEvent.setup();
    const generationEventSources: FakeGenerationEventSource[] = [];
    const { sourceTweetUrlInput, usersDirectionInput, generateButton } =
      renderWorkspace({ generationEventSources });

    await user.type(
      sourceTweetUrlInput,
      "https://x.com/siliconmania/status/1234567890",
    );
    await user.type(usersDirectionInput, "Keep the joke dry.");
    await user.click(generateButton);

    const events = buildStubbedGenerationEvents({
      sourceTweetUrl: "https://x.com/siliconmania/status/1234567890",
      usersDirection: "Keep the joke dry.",
    });

    expect(generationEventSources).toHaveLength(1);

    act(() => {
      generationEventSources[0]?.emit(events[0]);
    });

    expect(
      screen.getByRole("button", {
        name: /drafts for 1234567890.*running.*1\/3 drafts/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /completed draft comparison/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Model Provenance:/i)).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[1]);
      generationEventSources[0]?.emit(events[2]);
    });

    expect(screen.getByText("3/3")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /completed draft comparison/i }),
    ).not.toBeInTheDocument();

    act(() => {
      generationEventSources[0]?.emit(events[3]);
    });

    expect(generationEventSources[0]?.closed).toBe(true);
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
    const {
      sourceTweetUrlInput,
      usersDirectionInput,
      generateButton,
      generationStreamUrls,
    } = renderWorkspace();

    await user.type(
      sourceTweetUrlInput,
      "https://x.com/siliconmania/status/13579",
    );
    await user.type(usersDirectionInput, "Challenge the premise.");
    await user.click(generateButton);

    expect(generationStreamUrls).toEqual([
      "/api/generation-runs/stream?sourceTweetUrl=https%3A%2F%2Fx.com%2Fsiliconmania%2Fstatus%2F13579&usersDirection=Challenge+the+premise.",
    ]);
  });
});
