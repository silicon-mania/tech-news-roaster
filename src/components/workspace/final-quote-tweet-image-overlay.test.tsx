import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { FinalQuoteTweetImageOverlay } from "./final-quote-tweet-image-overlay";
import { buildCompletedRun, buildCompletedV3Run } from "./workspace-test-utils";

const selectedGeneratedImageFixture = {
  imageOptionId: "image-option-news-linked-image-1-variation-1",
  selectedAt: "2026-06-06T10:17:00.000Z",
};
const variationTwoFixture = {
  imageOptionId: "image-option-news-linked-image-1-variation-2",
  selectedAt: "2026-06-06T10:18:00.000Z",
};
// buildCompletedV3Run selects jokes[1] of the fixture visual joke set by default.
const selectedJokeTitle = "A workflow map where every exit arrow points back to the login screen.";

describe("FinalQuoteTweetImageOverlay", () => {
  test("stays hidden when the run has no generated image set", () => {
    const { container } = render(<FinalQuoteTweetImageOverlay run={buildCompletedRun()} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("stays hidden when the run has no visual jokes", () => {
    const { container } = render(
      <FinalQuoteTweetImageOverlay run={buildCompletedV3Run({ visualJokeSet: undefined })} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test("stays hidden when there is no active run", () => {
    const { container } = render(<FinalQuoteTweetImageOverlay run={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("starts expanded and names both missing picks when nothing is selected", () => {
    render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({ selectedGeneratedImage: null, selectedVisualJoke: null })}
      />,
    );

    expect(
      screen.getByText(
        "Select a generated image and a visual joke to assemble the final quote tweet image.",
      ),
    ).toHaveRole("status");
    expect(
      screen.queryByRole("button", { name: "Download final quote tweet image" }),
    ).not.toBeInTheDocument();
  });

  test("names only the missing image when the visual joke is already selected", () => {
    render(
      <FinalQuoteTweetImageOverlay run={buildCompletedV3Run({ selectedGeneratedImage: null })} />,
    );

    expect(
      screen.getByText("Select a generated image to assemble the final quote tweet image."),
    ).toBeInTheDocument();
  });

  test("renders the composite, whole, once both picks exist", () => {
    render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })}
      />,
    );

    // The non-editable punchline renders whole and nothing clamps it.
    const title = screen.getByText(selectedJokeTitle);

    expect(title.className).not.toMatch(/truncate|line-clamp/);

    const image = screen.getByRole("img", { name: "Launch visual variation 1." });

    expect(image).toHaveAttribute(
      "src",
      expect.stringContaining("news-linked-image-1-variation-1"),
    );
    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();
  });

  test("collapses to the rainbow strip and expands again on demand", async () => {
    const user = userEvent.setup();

    render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })}
      />,
    );

    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Collapse final quote tweet image" }));

    // Collapsed: the composite is gone, only the expand affordance remains.
    expect(
      screen.queryByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).not.toBeInTheDocument();
    const expandButton = screen.getByRole("button", { name: "Expand final quote tweet image" });

    await user.click(expandButton);

    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();
  });

  test("a selection change re-expands the overlay after a manual collapse", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Collapse final quote tweet image" }));
    expect(
      screen.queryByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).not.toBeInTheDocument();

    rerender(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({ selectedGeneratedImage: variationTwoFixture })}
      />,
    );

    // Picking a different image is a selection change, so the overlay reopens.
    expect(
      await screen.findByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Launch visual variation 2." })).toBeInTheDocument();
  });

  test("download calls the injected rasterizer and offers a PNG named from the run label", async () => {
    const user = userEvent.setup();
    const rasterizeComposite = vi.fn(async (_node: HTMLElement) => "data:image/png;base64,final");
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <FinalQuoteTweetImageOverlay
        rasterizeComposite={rasterizeComposite}
        run={buildCompletedV3Run({
          label: "Drafts: OpenAI's GPU/teardown",
          selectedGeneratedImage: selectedGeneratedImageFixture,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Download final quote tweet image" }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(rasterizeComposite).toHaveBeenCalledWith(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    );

    const offeredAnchor = anchorClick.mock.contexts[0] as HTMLAnchorElement;

    expect(offeredAnchor.download).toBe("drafts-openai-s-gpu-teardown");
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
        <FinalQuoteTweetImageOverlay
          rasterizeComposite={rasterizeComposite}
          run={buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })}
        />
        <Toaster />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Download final quote tweet image" }));

    expect(
      await screen.findByText("Couldn't download the final quote tweet image"),
    ).toBeInTheDocument();
  });
});
