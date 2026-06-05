import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { type GenerationIntake, IntakeWorkspace } from "./intake-workspace";

function renderWorkspace(
  onStartGenerationRun: (intake: GenerationIntake) => void = vi.fn(),
) {
  render(<IntakeWorkspace onStartGenerationRun={onStartGenerationRun} />);

  return {
    sourceTweetUrlInput: screen.getByLabelText(/source tweet url/i),
    usersDirectionInput: screen.getByLabelText(/user's direction/i),
    generateButton: screen.getByRole("button", { name: /generate drafts/i }),
  };
}

describe("IntakeWorkspace", () => {
  test("submits a valid direct Source Tweet URL with optional User's Direction", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, usersDirectionInput, generateButton } =
      renderWorkspace(startGenerationRun);

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
  });

  test("rejects invalid URLs before generation starts", async () => {
    const user = userEvent.setup();
    const startGenerationRun = vi.fn();
    const { sourceTweetUrlInput, generateButton } =
      renderWorkspace(startGenerationRun);

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
    const { sourceTweetUrlInput, generateButton } =
      renderWorkspace(startGenerationRun);

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
});
