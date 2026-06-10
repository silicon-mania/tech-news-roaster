import "@testing-library/jest-dom/vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import type { GenerationRun } from "./workspace";
import { renderWorkspace } from "./workspace-test-utils";

describe("Workspace runs navigation", () => {
  test("opens the runs drawer and User's Direction panel from opposite sides on desktop and mobile-sized viewports", async () => {
    const user = userEvent.setup();

    vi.stubGlobal("innerWidth", 1280);
    renderWorkspace();

    await user.click(screen.getByRole("button", { name: /open runs drawer, 0 runs/i }));
    expect(screen.getByRole("complementary", { name: /runs drawer/i })).toHaveClass("left-0");

    await user.click(screen.getByRole("button", { name: /close runs drawer/i }));
    await user.click(screen.getByRole("button", { name: /open user's direction panel/i }));
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
    expect(screen.getByTitle("User's Direction has content")).toBeInTheDocument();

    vi.stubGlobal("innerWidth", 390);
    await user.click(screen.getByRole("button", { name: /open runs drawer, 0 runs/i }));
    expect(screen.getByRole("complementary", { name: /runs drawer/i })).toBeInTheDocument();
  });

  test("keeps the running run inspectable and prevents another in-flight run", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } = renderWorkspace({
      onStartGenerationRun: startGenerationRun,
    });

    await user.type(sourceTweetUrlInput, "https://x.com/siliconmania/status/1234567890");
    await user.click(generateButton);

    await user.click(screen.getByRole("button", { name: /open runs drawer, 1 runs/i }));
    expect(
      screen.getByRole("button", {
        name: /new generation run.*just now/i,
      }),
    ).toHaveAttribute("aria-current", "true");
    expect(screen.getByTitle("Enrichment running")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "0/3",
    );
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

    expect(screen.getByRole("region", { name: /compressed intake bar/i })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "0/3",
    );

    await user.click(screen.getByRole("button", { name: /open runs drawer, 2 runs/i }));
    await user.click(screen.getByRole("button", { name: /second run/i }));

    expect(screen.getByRole("region", { name: /generation waiting state/i })).toHaveTextContent(
      "1/3",
    );
    expect(screen.queryByRole("complementary", { name: /runs drawer/i })).not.toBeInTheDocument();
  });
});
