import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { newsCategories } from "@/services/generation";
import { NewsCategorySection } from "./news-category-section";

// Fills both required callbacks with spies and returns them, so a test only names
// the one(s) it asserts on. Extra props (e.g. newsCategory) override the defaults.
function renderSection(props: Partial<Parameters<typeof NewsCategorySection>[0]> = {}) {
  const onNewsCategoryChange = vi.fn();
  const onNewsCategoryCustomChange = vi.fn();

  render(
    <NewsCategorySection
      onNewsCategoryChange={onNewsCategoryChange}
      onNewsCategoryCustomChange={onNewsCategoryCustomChange}
      {...props}
    />,
  );

  return { onNewsCategoryChange, onNewsCategoryCustomChange };
}

function getCustomField() {
  return screen.getByRole("textbox", { name: "Custom news category" });
}

// The component owns its chips and the custom field (the surface supplies the
// labeled section and heading), so these tests query them straight off the render.
describe("NewsCategorySection", () => {
  test("renders the ten vocabulary values as chips", () => {
    renderSection();

    expect(screen.getAllByRole("button")).toHaveLength(newsCategories.length);
    for (const category of newsCategories) {
      expect(screen.getByRole("button", { name: category })).toBeInTheDocument();
    }
  });

  test("pre-selects the chip matching the run's current value", () => {
    renderSection({ newsCategory: "ACQUIRED" });

    // The matching chip is the lit one...
    expect(screen.getByRole("button", { name: "ACQUIRED", pressed: true })).toBeInTheDocument();
    // ...and it is the only one.
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  test("pre-selects VIRAL when the run carries no value", () => {
    renderSection();

    expect(screen.getByRole("button", { name: "VIRAL", pressed: true })).toBeInTheDocument();
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  test("clicking a chip invokes the immediate change with that value", async () => {
    const user = userEvent.setup();
    const { onNewsCategoryChange, onNewsCategoryCustomChange } = renderSection({
      newsCategory: "VIRAL",
    });

    await user.click(screen.getByRole("button", { name: "LAUNCHED" }));

    // A chip pick routes through the immediate-save callback, never the debounced one.
    expect(onNewsCategoryChange).toHaveBeenCalledExactlyOnceWith("LAUNCHED");
    expect(onNewsCategoryCustomChange).not.toHaveBeenCalled();
  });

  test("re-picking the already-selected chip is a no-op", async () => {
    const user = userEvent.setup();
    const { onNewsCategoryChange } = renderSection({ newsCategory: "FUNDED" });

    await user.click(screen.getByRole("button", { name: "FUNDED" }));

    expect(onNewsCategoryChange).not.toHaveBeenCalled();
  });

  test("renders the custom field beneath the chips", () => {
    renderSection();

    const field = getCustomField();
    expect(field).toBeInTheDocument();
    // It sits after the chips in document order — the field is "beneath" them.
    const viralChip = screen.getByRole("button", { name: "VIRAL" });
    expect(
      viralChip.compareDocumentPosition(field) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test("a custom word lights no chip and fills the field — mutually exclusive", () => {
    renderSection({ newsCategory: "breaking" });

    // A value outside the ten lights no chip...
    expect(screen.queryByRole("button", { pressed: true })).not.toBeInTheDocument();
    // ...and fills the custom field with the stored (un-cased) word instead.
    expect(getCustomField()).toHaveValue("breaking");
  });

  test("typing a custom word invokes the debounced change with the typed text", async () => {
    const user = userEvent.setup();
    const { onNewsCategoryChange, onNewsCategoryCustomChange } = renderSection();

    await user.type(getCustomField(), "x");

    // The edit routes through the debounced-save callback, never the immediate one.
    expect(onNewsCategoryCustomChange).toHaveBeenLastCalledWith("x");
    expect(onNewsCategoryChange).not.toHaveBeenCalled();
  });

  test("clearing the custom field resolves the value back to VIRAL", async () => {
    const user = userEvent.setup();
    const { onNewsCategoryCustomChange } = renderSection({ newsCategory: "breaking" });

    await user.clear(getCustomField());

    // Cleared with no chip lit snaps to VIRAL, the residual floor.
    expect(onNewsCategoryCustomChange).toHaveBeenLastCalledWith("VIRAL");
  });

  test("the custom field enforces a maxLength cap", () => {
    renderSection();

    expect(getCustomField()).toHaveAttribute("maxlength", "24");
  });
});
