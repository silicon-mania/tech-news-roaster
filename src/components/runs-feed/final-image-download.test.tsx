import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { buildCompletedV3Run } from "../workspace/workspace-test-utils";
import { FinalImageDownload } from "./final-image-download";

// buildCompletedV3Run leaves the generated image unselected, so the composite
// falls back to the first variation (Automated Selection), exactly as the Run
// Card does. The composite renders the fixed label where the Joke Title once sat.
const placeholderLabel = "LABEL GOES HERE";
const firstVariationAlt = "Launch visual variation 1.";

describe("FinalImageDownload", () => {
  test("renders the run's Final Quote Tweet Image composite whole", () => {
    render(<FinalImageDownload run={buildCompletedV3Run()} />);

    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();

    // The non-editable label renders whole — nothing truncates or clamps it.
    const title = screen.getByText(placeholderLabel);
    expect(title.className).not.toMatch(/truncate|line-clamp/);

    expect(screen.getByRole("img", { name: firstVariationAlt })).toHaveAttribute(
      "src",
      expect.stringContaining("news-linked-image-1-variation-1"),
    );
  });

  test("falls back to the first variation when the run has no explicit image selection", () => {
    render(<FinalImageDownload run={buildCompletedV3Run({ selectedGeneratedImage: null })} />);

    // Matches the Run Card: the fixed label over the first generated variation.
    expect(screen.getByText(placeholderLabel)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: firstVariationAlt })).toBeInTheDocument();
  });

  test("download captures the preview node and offers a PNG named from the run label", async () => {
    const user = userEvent.setup();
    const rasterizeComposite = vi.fn(async (_node: HTMLElement) => "data:image/png;base64,final");
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <FinalImageDownload
        rasterizeComposite={rasterizeComposite}
        run={buildCompletedV3Run({ label: "Drafts: OpenAI's GPU/teardown" })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Download final quote tweet image" }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    // It rasterizes the exact preview node — preview equals download.
    expect(rasterizeComposite).toHaveBeenCalledWith(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    );

    const offeredAnchor = anchorClick.mock.contexts[0] as HTMLAnchorElement;
    // A `.png` extension so the file saves cleanly.
    expect(offeredAnchor.download).toBe("drafts-openai-s-gpu-teardown.png");
    expect(offeredAnchor.href).toBe("data:image/png;base64,final");

    anchorClick.mockRestore();
  });

  test("surfaces a quiet toast when rasterization fails", async () => {
    vi.stubGlobal("matchMedia", () => ({
      addEventListener: vi.fn(),
      matches: false,
      removeEventListener: vi.fn(),
    }));

    const user = userEvent.setup();
    const rasterizeComposite = vi.fn(async () => {
      throw new Error("capture failed");
    });

    render(
      <>
        <FinalImageDownload rasterizeComposite={rasterizeComposite} run={buildCompletedV3Run()} />
        <Toaster />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Download final quote tweet image" }));

    expect(
      await screen.findByText("Couldn't download the final quote tweet image"),
    ).toBeInTheDocument();
  });
});
