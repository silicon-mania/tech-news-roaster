import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { GenerationRun } from "./workspace";
import { renderWorkspace } from "./workspace-test-utils";

describe("Workspace runs navigation", () => {
  test("pins the runs sidebar open and toggles it from the same icon, with the User's Direction inline in the composer", async () => {
    const user = userEvent.setup();

    vi.stubGlobal("innerWidth", 1280);
    renderWorkspace();

    const openRunsButton = screen.getByRole("button", { name: /open runs, 0 saved/i });
    expect(openRunsButton).toHaveAttribute("aria-expanded", "false");

    await user.click(openRunsButton);
    const collapseRunsButton = screen.getByRole("button", { name: /collapse runs/i });
    expect(collapseRunsButton).toHaveAttribute("aria-expanded", "true");
    expect(collapseRunsButton).toHaveAttribute("aria-controls", "runs-sidebar-panel");

    await user.click(collapseRunsButton);
    // Un-pinning flips the trigger back to its "open" label (it still peeks while
    // the pointer hovers, which userEvent keeps simulated after the click).
    expect(screen.getByRole("button", { name: /open runs, 0 saved/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /collapse runs/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /add direction/i }));
    await user.type(
      screen.getByRole("textbox", { name: /^user's direction$/i }),
      "Respect the SEC angle.",
    );
    // Collapsing the field while it holds content surfaces the "has content" dot.
    await user.click(screen.getByRole("button", { name: /hide direction/i }));
    expect(screen.queryByRole("textbox", { name: /^user's direction$/i })).not.toBeInTheDocument();
    expect(screen.getByTitle("User's Direction has content")).toBeInTheDocument();
  });

  test("keeps the running run inspectable and prevents another in-flight run", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    await user.click(screen.getByRole("button", { name: /open runs, 1 saved/i }));
    expect(
      screen.getByRole("button", {
        name: /new generation run.*just now/i,
      }),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByTitle("Enrichment running")).toBeInTheDocument();
    expect(screen.getByLabelText(/text generation loading/i)).toBeInTheDocument();
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
      screen.getByRole("region", { name: /compressed source tweet bar/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/text generation loading/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /open runs, 2 saved/i }));
    await user.click(screen.getByRole("button", { name: /second run/i }));

    expect(screen.getByLabelText(/text generation loading/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /second run/i })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
