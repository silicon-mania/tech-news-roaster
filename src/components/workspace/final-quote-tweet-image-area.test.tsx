import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { FinalQuoteTweetImageArea } from "./final-quote-tweet-image-area";
import {
  buildCompletedRun,
  buildCompletedV3Run,
  buildFailedImageSet,
  buildNewsLinkedImages,
} from "./workspace-test-utils";

const selectedGeneratedImageFixture = {
  imageOptionId: "image-option-news-linked-image-1-variation-1",
  selectedAt: "2026-06-06T10:17:00.000Z",
};

describe("FinalQuoteTweetImageArea", () => {
  test("stays hidden when no image set with variations exists", () => {
    const { container } = render(<FinalQuoteTweetImageArea run={buildCompletedRun()} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("stays hidden while image generation is still running", () => {
    const run = buildCompletedV3Run({
      failedImageSets: [],
      imageGenerationState: {
        selectedImageIds: ["news-linked-image-1"],
        startedAt: "2026-06-06T10:20:00.000Z",
        status: "running",
        userImagePrompt: "Make the image feel launch-ready.",
      },
      imageSets: [],
    });

    const { container } = render(<FinalQuoteTweetImageArea run={run} />);

    expect(container).toBeEmptyDOMElement();
  });

  test("shows the creative failure pattern when image generation failed entirely", () => {
    const newsLinkedImages = buildNewsLinkedImages();
    const run = buildCompletedV3Run({
      failedImageSets: [
        buildFailedImageSet(newsLinkedImages[0]),
        buildFailedImageSet(newsLinkedImages[1]),
      ],
      imageGenerationState: {
        completedAt: "2026-06-06T10:25:00.000Z",
        selectedImageIds: [newsLinkedImages[0].id, newsLinkedImages[1].id],
        startedAt: "2026-06-06T10:20:00.000Z",
        status: "failed",
        userImagePrompt: "Make the image feel launch-ready.",
      },
      imageSets: [],
    });

    render(<FinalQuoteTweetImageArea run={run} />);

    expect(
      screen.getByRole("region", { name: "Final Quote Tweet Image Creative Result Area" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Final quote tweet image failed")).toBeInTheDocument();
  });

  test("names both missing picks in the quiet empty state", () => {
    const run = buildCompletedV3Run({ selectedGeneratedImage: null, selectedVisualJoke: null });

    render(<FinalQuoteTweetImageArea run={run} />);

    expect(
      screen.getByText(
        "Select a generated image and a visual joke to assemble the final quote tweet image.",
      ),
    ).toHaveRole("status");
  });

  test("names the missing image when only the visual joke is selected", () => {
    const run = buildCompletedV3Run({ selectedGeneratedImage: null });

    render(<FinalQuoteTweetImageArea run={run} />);

    expect(
      screen.getByText("Select a generated image to assemble the final quote tweet image."),
    ).toBeInTheDocument();
  });

  test("names the missing joke when only the generated image is selected", () => {
    const run = buildCompletedV3Run({
      selectedGeneratedImage: selectedGeneratedImageFixture,
      selectedVisualJoke: null,
    });

    render(<FinalQuoteTweetImageArea run={run} />);

    expect(
      screen.getByText("Select a visual joke to assemble the final quote tweet image."),
    ).toBeInTheDocument();
  });

  test("treats a selection that points at the original image option as a missing pick", () => {
    const run = buildCompletedV3Run({
      selectedGeneratedImage: {
        imageOptionId: "image-option-news-linked-image-1-original",
        selectedAt: "2026-06-06T10:17:00.000Z",
      },
    });

    render(<FinalQuoteTweetImageArea run={run} />);

    expect(
      screen.getByText("Select a generated image to assemble the final quote tweet image."),
    ).toBeInTheDocument();
  });

  test("renders the composite with the joke title and the selected generated image", () => {
    const run = buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture });

    render(<FinalQuoteTweetImageArea run={run} />);

    // getByText matches the full normalized text, so the non-editable
    // punchline rendered whole — and nothing in our markup clamps it.
    const title = screen.getByText(
      "A workflow map where every exit arrow points back to the login screen.",
    );

    expect(title.className).not.toMatch(/truncate|line-clamp/);
    expect(title.closest("figcaption")).not.toHaveStyle({ overflow: "hidden" });

    const image = screen.getByRole("img", { name: "Launch visual variation 1." });

    expect(image).toHaveAttribute(
      "src",
      expect.stringContaining("news-linked-image-1-variation-1"),
    );
    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();
  });

  test("updates the preview when either selection changes", () => {
    const { rerender } = render(
      <FinalQuoteTweetImageArea
        run={buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })}
      />,
    );

    expect(screen.getByRole("img", { name: "Launch visual variation 1." })).toBeInTheDocument();

    rerender(
      <FinalQuoteTweetImageArea
        run={buildCompletedV3Run({
          selectedGeneratedImage: {
            imageOptionId: "image-option-news-linked-image-1-variation-2",
            selectedAt: "2026-06-06T10:18:00.000Z",
          },
        })}
      />,
    );

    expect(screen.getByRole("img", { name: "Launch visual variation 2." })).toBeInTheDocument();
    expect(
      screen.getByText("A workflow map where every exit arrow points back to the login screen."),
    ).toBeInTheDocument();

    rerender(
      <FinalQuoteTweetImageArea
        run={buildCompletedV3Run({
          selectedGeneratedImage: selectedGeneratedImageFixture,
          selectedVisualJoke: {
            selectedAt: "2026-06-06T10:19:00.000Z",
            visualJokeId: "visual-joke-1",
          },
        })}
      />,
    );

    expect(
      screen.getByText("A one-click launch button labeled 'Eventually, manual work.'"),
    ).toBeInTheDocument();
  });

  test("offers no download action while a pick is missing", () => {
    render(
      <FinalQuoteTweetImageArea run={buildCompletedV3Run({ selectedGeneratedImage: null })} />,
    );

    expect(
      screen.queryByRole("button", { name: "Download final quote tweet image" }),
    ).not.toBeInTheDocument();
  });

  test("download calls the injected rasterizer with the composite and offers a PNG named from the run label", async () => {
    const user = userEvent.setup();
    const rasterizeComposite = vi.fn(async (_node: HTMLElement) => "data:image/png;base64,final");
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    render(
      <FinalQuoteTweetImageArea
        rasterizeComposite={rasterizeComposite}
        run={buildCompletedV3Run({
          label: "Drafts: OpenAI's GPU/teardown",
          selectedGeneratedImage: selectedGeneratedImageFixture,
        })}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Download final quote tweet image" }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(rasterizeComposite).toHaveBeenCalledTimes(1);
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
        <FinalQuoteTweetImageArea
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
