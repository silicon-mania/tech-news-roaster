import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { JokeTitleEditor } from "./joke-title-editor";

// The editor is controlled, so the harness owns the value and feeds edits back —
// mirroring how the Workspace (and the future Selected Run sidebar) drive it.
function ControlledJokeTitleEditor({
  initialValue,
  onValueChange,
}: {
  initialValue: string;
  onValueChange?: (value: string) => void;
}) {
  const [value, setValue] = useState(initialValue);

  return (
    <JokeTitleEditor
      label="Satire visual joke 1"
      onValueChange={(next) => {
        setValue(next);
        onValueChange?.(next);
      }}
      value={value}
    />
  );
}

describe("JokeTitleEditor", () => {
  test("renders the current title and reveals the editor on click", async () => {
    const user = userEvent.setup();

    render(<ControlledJokeTitleEditor initialValue="A one-click launch button." />);

    // Reads as the current title until the operator chooses to edit it.
    expect(screen.getByText("A one-click launch button.")).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /edit satire visual joke 1/i }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /edit satire visual joke 1/i }));

    expect(screen.getByRole("textbox", { name: /edit satire visual joke 1/i })).toHaveValue(
      "A one-click launch button.",
    );
  });

  test("accepts an inline edit and emits the overwritten title", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <ControlledJokeTitleEditor
        initialValue="Original joke title."
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole("button", { name: /edit satire visual joke 1/i }));
    const editor = screen.getByRole("textbox", { name: /edit satire visual joke 1/i });

    await user.clear(editor);
    await user.type(editor, "Overwritten joke title.");

    expect(editor).toHaveValue("Overwritten joke title.");
    expect(onValueChange).toHaveBeenLastCalledWith("Overwritten joke title.");
  });
});
