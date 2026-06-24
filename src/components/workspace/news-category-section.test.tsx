import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  categoryBandColors,
  type NewsCategoryClassificationState,
  newsCategories,
} from "@/services/generation";
import { NewsCategorySection } from "./news-category-section";

// A failed classifier result-state — the shape that lights the section's quiet
// ghost error icon. Its fields double as the FailureDetails the reveal shows.
const failedClassification: NewsCategoryClassificationState = {
  debugLog: ["sent joke context to classifier", "model returned an empty category"],
  failedAt: "2026-06-24T10:00:05.000Z",
  message: "Classifier returned no category",
  startedAt: "2026-06-24T10:00:00.000Z",
  status: "failed",
};

// A completed classifier result-state — a success carries nothing to surface, so
// the section shows no error affordance for it (nor for an absent state).
const completedClassification: NewsCategoryClassificationState = {
  completedAt: "2026-06-24T10:00:05.000Z",
  startedAt: "2026-06-24T10:00:00.000Z",
  status: "completed",
};

const failureTriggerName = "Open News Category Classification Failure Details";

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

  test("renders every chip's News Category Color swatch — even unselected", () => {
    renderSection();

    // Each chip wears its band color as an at-rest swatch, so the whole
    // category→color mapping reads before the operator picks anything.
    for (const category of newsCategories) {
      const chip = screen.getByRole("button", { name: category });
      const swatch = chip.querySelector('[data-slot="news-category-swatch"]');

      expect(swatch).toBeInTheDocument();
      expect(swatch).toHaveStyle({ backgroundColor: categoryBandColors[category] });
    }
  });

  test("the lit chip reads in its own band color", () => {
    renderSection({ newsCategory: "ACQUIRED" });

    // The active selection fills with its News Category Color, so it — and the band
    // color it stamps on the poster — is unmistakable.
    expect(screen.getByRole("button", { name: "ACQUIRED", pressed: true })).toHaveStyle({
      backgroundColor: categoryBandColors.ACQUIRED,
    });
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

  describe("classification failure affordance", () => {
    test("renders the ghost error icon when the classification failed", () => {
      renderSection({ newsCategoryClassification: failedClassification });

      expect(screen.getByRole("button", { name: failureTriggerName })).toBeInTheDocument();
    });

    test("the Quiet Failure Details reveal exposes the message and debug log", async () => {
      const user = userEvent.setup();
      renderSection({ newsCategoryClassification: failedClassification });

      await user.click(screen.getByRole("button", { name: failureTriggerName }));

      // The reveal reuses the shared Quiet Failure Details surface...
      expect(screen.getByText("Quiet Failure Details")).toBeInTheDocument();
      // ...exposing the failure message and every debug-log line.
      expect(screen.getByText(/Classifier returned no category/)).toBeInTheDocument();
      expect(screen.getByText(/model returned an empty category/)).toBeInTheDocument();
    });

    test("shows no error affordance for a completed classification", () => {
      renderSection({ newsCategoryClassification: completedClassification });

      expect(screen.queryByRole("button", { name: failureTriggerName })).not.toBeInTheDocument();
    });

    test("shows no error affordance when the classification state is absent", () => {
      renderSection();

      expect(screen.queryByRole("button", { name: failureTriggerName })).not.toBeInTheDocument();
    });

    test("a failed classification leaves the editor intact — VIRAL still lights", () => {
      // The failure never breaks the run: the chips still work and VIRAL, the
      // residual stamp, stays lit alongside the quiet error icon.
      renderSection({ newsCategoryClassification: failedClassification });

      expect(screen.getByRole("button", { name: "VIRAL", pressed: true })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: failureTriggerName })).toBeInTheDocument();
    });
  });
});
