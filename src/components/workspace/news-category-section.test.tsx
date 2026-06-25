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
  const onNewsCategoryColorChange = vi.fn();

  const view = render(
    <NewsCategorySection
      onNewsCategoryChange={onNewsCategoryChange}
      onNewsCategoryCustomChange={onNewsCategoryCustomChange}
      onNewsCategoryColorChange={onNewsCategoryColorChange}
      {...props}
    />,
  );

  return { onNewsCategoryChange, onNewsCategoryCustomChange, onNewsCategoryColorChange, view };
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

  test("chips are monochrome at rest — no at-rest color swatch", () => {
    renderSection();

    // Signal Desk (ADR-0030): chips are plain labels at rest; color appears only on
    // the lit chip, so a color on a chip always means "selected", never decoration.
    for (const category of newsCategories) {
      const chip = screen.getByRole("button", { name: category });

      expect(chip.querySelector('[data-slot="news-category-swatch"]')).toBeNull();
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

    // A value outside the ten lights no chip (the Band color row's active swatch is
    // a separate control, so scope to the category chips by their bare name)...
    for (const category of newsCategories) {
      expect(screen.getByRole("button", { name: category })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    }
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

  describe("custom-word band color row", () => {
    test("a custom word reveals the Band color row of ten category swatches", () => {
      renderSection({ newsCategory: "breaking" });

      // Each swatch is named (and tooltip-named) by the category its color comes
      // from, so the operator can tint their custom label's band.
      for (const category of newsCategories) {
        expect(screen.getByRole("button", { name: `${category} band color` })).toBeInTheDocument();
      }
    });

    test("a lit preset chip shows no Band color row — presets have no color control", () => {
      renderSection({ newsCategory: "ACQUIRED" });

      expect(screen.queryByRole("button", { name: "VIRAL band color" })).not.toBeInTheDocument();
    });

    test("a value-less run (VIRAL preset) shows no Band color row", () => {
      renderSection();

      expect(screen.queryByRole("button", { name: "VIRAL band color" })).not.toBeInTheDocument();
    });

    test("the active swatch defaults to VIRAL when the custom word has no stored color", () => {
      renderSection({ newsCategory: "breaking" });

      expect(
        screen.getByRole("button", { name: "VIRAL band color", pressed: true }),
      ).toBeInTheDocument();
      // It is the only highlighted swatch.
      expect(screen.getByRole("button", { name: "DRAMA band color" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    test("the stored newsCategoryColor is the highlighted swatch", () => {
      renderSection({ newsCategory: "breaking", newsCategoryColor: "DRAMA" });

      expect(
        screen.getByRole("button", { name: "DRAMA band color", pressed: true }),
      ).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "VIRAL band color" })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
    });

    test("clicking a swatch invokes the immediate-save callback, never the debounced text one", async () => {
      const user = userEvent.setup();
      const { onNewsCategoryColorChange, onNewsCategoryCustomChange, onNewsCategoryChange } =
        renderSection({ newsCategory: "breaking" });

      await user.click(screen.getByRole("button", { name: "FUNDED band color" }));

      // The color pick rides the same immediate save a chip pick uses — never the
      // debounced custom-word text path, and never the chip change.
      expect(onNewsCategoryColorChange).toHaveBeenCalledExactlyOnceWith("FUNDED");
      expect(onNewsCategoryCustomChange).not.toHaveBeenCalled();
      expect(onNewsCategoryChange).not.toHaveBeenCalled();
    });

    test("re-picking the active swatch is a no-op", async () => {
      const user = userEvent.setup();
      const { onNewsCategoryColorChange } = renderSection({
        newsCategory: "breaking",
        newsCategoryColor: "DRAMA",
      });

      await user.click(screen.getByRole("button", { name: "DRAMA band color" }));

      // The active color is the floor here, so re-picking it skips a redundant save.
      expect(onNewsCategoryColorChange).not.toHaveBeenCalled();
    });

    test("switching from a custom word back to a preset chip hides the row", () => {
      const noop = vi.fn();
      const element = (newsCategory: string) => (
        <NewsCategorySection
          newsCategory={newsCategory}
          onNewsCategoryChange={noop}
          onNewsCategoryCustomChange={noop}
          onNewsCategoryColorChange={noop}
        />
      );

      const { rerender } = render(element("breaking"));
      // The custom word shows the row...
      expect(screen.getByRole("button", { name: "VIRAL band color" })).toBeInTheDocument();

      // ...and switching to a preset chip removes it.
      rerender(element("ACQUIRED"));
      expect(screen.queryByRole("button", { name: "VIRAL band color" })).not.toBeInTheDocument();
    });
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
