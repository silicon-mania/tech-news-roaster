import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { categoryBandColors } from "@/services/generation";
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
// A value-less run renders the VIRAL fallback as its News Category stamp (ADR-0027).
const fallbackStamp = "VIRAL";

describe("FinalQuoteTweetImageOverlay", () => {
  test("stays hidden when the run has no generated image set", () => {
    const { container } = render(<FinalQuoteTweetImageOverlay run={buildCompletedRun()} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("stays hidden when there is no active run", () => {
    const { container } = render(<FinalQuoteTweetImageOverlay run={null} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("mounts the composite from the image alone, stamped with the VIRAL fallback", () => {
    // A completed Image Set and a Selected Generated Image are the only inputs;
    // the composite still assembles from them alone.
    render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({
          selectedGeneratedImage: selectedGeneratedImageFixture,
        })}
      />,
    );

    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();
    expect(screen.getByText(fallbackStamp)).toBeInTheDocument();
  });

  test("stamps the composite with the run's News Category, uppercased", () => {
    render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({
          newsCategory: "acquired",
          selectedGeneratedImage: selectedGeneratedImageFixture,
        })}
      />,
    );

    expect(screen.getByText("ACQUIRED")).toBeInTheDocument();
    expect(screen.queryByText(fallbackStamp)).not.toBeInTheDocument();
  });

  test("tints the composite band with the run's News Category Color", () => {
    render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({
          newsCategory: "ACQUIRED",
          selectedGeneratedImage: selectedGeneratedImageFixture,
        })}
      />,
    );

    expect(screen.getByRole("figure", { name: "Final Quote Tweet Image preview" })).toHaveStyle({
      backgroundColor: categoryBandColors.ACQUIRED,
    });
  });

  test("tints the band with the VIRAL fallback color when the run has no News Category", () => {
    render(
      <FinalQuoteTweetImageOverlay
        run={buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })}
      />,
    );

    expect(screen.getByRole("figure", { name: "Final Quote Tweet Image preview" })).toHaveStyle({
      backgroundColor: categoryBandColors.VIRAL,
    });
  });

  test("starts expanded and asks only for the image when none is selected", () => {
    render(
      <FinalQuoteTweetImageOverlay run={buildCompletedV3Run({ selectedGeneratedImage: null })} />,
    );

    const message = screen.getByText(
      "Select a generated image to assemble the final quote tweet image.",
    );

    expect(message).toHaveRole("status");
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

    // The stamp renders whole and nothing clamps it.
    const title = screen.getByText(fallbackStamp);

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

  test("collapses to the logo peek and expands again on demand", async () => {
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

  describe("on-air readiness cue", () => {
    // The run's first draft id, the operator's explicit Selected Draft when picked.
    const selectedDraftId = "draft-openai";
    const standbyStatus = "Standby — episode not ready";
    const programStatus = "Program — episode ready";

    test("reads standby when a draft is selected but no image resolves", () => {
      render(
        <FinalQuoteTweetImageOverlay
          run={buildCompletedV3Run({ selectedDraftId, selectedGeneratedImage: null })}
        />,
      );

      expect(screen.getByText(standbyStatus)).toHaveRole("status");
      expect(screen.queryByText(programStatus)).not.toBeInTheDocument();
    });

    test("reads standby when an image is selected but no draft is", () => {
      render(
        <FinalQuoteTweetImageOverlay
          run={buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })}
        />,
      );

      expect(screen.getByText(standbyStatus)).toHaveRole("status");
      expect(screen.queryByText(programStatus)).not.toBeInTheDocument();
    });

    test("reads standby, in words, when neither a draft nor an image resolves", () => {
      render(
        <FinalQuoteTweetImageOverlay run={buildCompletedV3Run({ selectedGeneratedImage: null })} />,
      );

      expect(screen.getByText(standbyStatus)).toHaveRole("status");
    });

    test("reads program, in green, when both a draft and an image resolve", () => {
      const { container } = render(
        <FinalQuoteTweetImageOverlay
          run={buildCompletedV3Run({
            selectedDraftId,
            selectedGeneratedImage: selectedGeneratedImageFixture,
          })}
        />,
      );

      expect(screen.getByText(programStatus)).toHaveRole("status");
      expect(screen.queryByText(standbyStatus)).not.toBeInTheDocument();
      // The expanded dot turns the green signal hue only in program.
      expect(container.querySelector(".bg-signal-green")).toBeInTheDocument();
    });

    test("collapsed peek reads STANDBY when not ready", async () => {
      const user = userEvent.setup();

      render(
        <FinalQuoteTweetImageOverlay
          run={buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Collapse final quote tweet image" }));

      const peekLabel = screen.getByText("STANDBY");

      expect(peekLabel).toBeInTheDocument();
      expect(peekLabel).not.toHaveClass("text-signal-green");
      expect(screen.queryByText("PGM")).not.toBeInTheDocument();
    });

    test("collapsed peek reads PGM, in green, when ready", async () => {
      const user = userEvent.setup();

      render(
        <FinalQuoteTweetImageOverlay
          run={buildCompletedV3Run({
            selectedDraftId,
            selectedGeneratedImage: selectedGeneratedImageFixture,
          })}
        />,
      );
      await user.click(screen.getByRole("button", { name: "Collapse final quote tweet image" }));

      expect(screen.getByText("PGM")).toHaveClass("text-signal-green");
      expect(screen.queryByText("STANDBY")).not.toBeInTheDocument();
    });

    test("recomputes live when the selected draft changes, with no stale state", () => {
      const { rerender } = render(
        <FinalQuoteTweetImageOverlay
          run={buildCompletedV3Run({
            selectedDraftId,
            selectedGeneratedImage: selectedGeneratedImageFixture,
          })}
        />,
      );

      expect(screen.getByText(programStatus)).toBeInTheDocument();

      rerender(
        <FinalQuoteTweetImageOverlay
          run={buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })}
        />,
      );

      expect(screen.getByText(standbyStatus)).toBeInTheDocument();
      expect(screen.queryByText(programStatus)).not.toBeInTheDocument();
    });

    test("leaves the download and collapse controls intact alongside the cue", () => {
      render(
        <FinalQuoteTweetImageOverlay
          run={buildCompletedV3Run({
            selectedDraftId,
            selectedGeneratedImage: selectedGeneratedImageFixture,
          })}
        />,
      );

      expect(screen.getByText(programStatus)).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Download final quote tweet image" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Collapse final quote tweet image" }),
      ).toBeInTheDocument();
    });
  });
});
