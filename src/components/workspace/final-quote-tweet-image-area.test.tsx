import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
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
});
