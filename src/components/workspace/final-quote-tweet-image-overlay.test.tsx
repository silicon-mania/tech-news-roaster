import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { FinalQuoteTweetImageOverlay } from "./final-quote-tweet-image-overlay";
import {
  buildCompletedRun,
  buildCompletedV3Run,
  buildImageSet,
  buildNewsLinkedImages,
} from "./workspace-test-utils";

const selectedGeneratedImageFixture = {
  imageOptionId: "image-option-news-linked-image-1-variation-1",
  selectedAt: "2026-06-06T10:17:00.000Z",
};
const variationTwoFixture = {
  imageOptionId: "image-option-news-linked-image-1-variation-2",
  selectedAt: "2026-06-06T10:18:00.000Z",
};
// The composite renders the fixed label where the Joke Title once sat (ADR-0026).
const placeholderLabel = "LABEL GOES HERE";

describe("FinalQuoteTweetImageOverlay", () => {
  test("stays hidden when the run has no generated image set", () => {
    const { container } = render(<FinalQuoteTweetImageOverlay run={buildCompletedRun()} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("stays hidden when there is no active run", () => {
    const { container } = render(<FinalQuoteTweetImageOverlay run={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("mounts with the placeholder composite from the image alone, no visual joke", () => {
    // A completed Image Set and a Selected Generated Image are the only inputs;
    // the run carries no visual joke at all and the composite still assembles.
    render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({
          selectedGeneratedImage: selectedGeneratedImageFixture,
          selectedVisualJoke: null,
          visualJokeSet: undefined,
        })}
      />,
    );

    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText(placeholderLabel)).toBeInTheDocument();
  });

  test("starts expanded and asks only for the image when none is selected", () => {
    render(
      <FinalQuoteTweetImageOverlay run={buildCompletedV3Run({ selectedGeneratedImage: null })} />,
    );

    const message = screen.getByText(
      "Select a generated image to assemble the final quote tweet image.",
    );

    expect(message).toHaveRole("status");
    // The missing-pick message never asks for a visual joke.
    expect(message).not.toHaveTextContent(/visual joke/i);
    expect(
      screen.queryByRole("button", { name: "Download final quote tweet image" }),
    ).not.toBeInTheDocument();
  });

  test("renders the composite, whole, once an image is selected", () => {
    render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })}
      />,
    );

    // The non-editable label renders whole and nothing clamps it.
    const title = screen.getByText(placeholderLabel);

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

  test("renders the composite for an upload-only run (no source-derived set)", () => {
    // The run reached its image through uploads alone — `imageSet` is absent and the
    // selected variation lives in a completed Uploaded Image Set (ADR-0025).
    const uploadedSet = buildImageSet(buildNewsLinkedImages()[1]);

    render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({
          imageSet: undefined,
          selectedGeneratedImage: {
            imageOptionId: "image-option-news-linked-image-2-variation-1",
            selectedAt: "2026-06-06T11:30:00.000Z",
          },
          uploadedImageSets: [{ imageSet: uploadedSet, status: "completed" }],
        })}
      />,
    );

    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Platform visual variation 1." })).toBeInTheDocument();
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
