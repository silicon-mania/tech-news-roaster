import "@testing-library/jest-dom/vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test, vi } from "vitest";
import {
  buildCompletedRun,
  buildCompletedV3Run,
  createMemorySavedRunStore,
  renderWorkspace,
} from "./workspace-test-utils";

const selectedGeneratedImageFixture = {
  imageOptionId: "image-option-news-linked-image-1-variation-1",
  selectedAt: "2026-06-06T10:17:00.000Z",
};
// A value-less run renders the VIRAL fallback as its News Category stamp
// (ADR-0027); the fixture image above is the run's first variation.
const fallbackStamp = "VIRAL";
const selectedVariationName = "Launch visual variation 1.";

describe("Workspace final quote tweet image overlay", () => {
  test("renders the composite in the sticky overlay, outside the creative workspace flow", () => {
    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })],
    });

    const finalArea = screen.getByRole("region", {
      name: /final quote tweet image creative result area/i,
    });

    // The overlay is a viewport-anchored sibling, not part of the in-flow run layout.
    const creativeWorkspace = screen.getByRole("region", {
      name: /responsive creative workspace/i,
    });

    expect(
      within(creativeWorkspace).queryByRole("region", {
        name: /final quote tweet image creative result area/i,
      }),
    ).not.toBeInTheDocument();

    // Derived composite: the News Category stamp over the Selected Generated Image.
    expect(
      within(finalArea).getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();
    expect(within(finalArea).getByText(fallbackStamp)).toBeInTheDocument();
    expect(within(finalArea).getByRole("img", { name: selectedVariationName })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /download final quote tweet image/i }),
    ).toBeInTheDocument();
  });

  test("reopening a saved run with a selected image renders the composite without re-running generation", async () => {
    const onStartGenerationRun = vi.fn();
    const onStartImageGeneration = vi.fn();
    const imageGenerationStreamFetcher = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(""),
    );
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture }),
    ]);

    const { generationStreamUrls } = renderWorkspace({
      imageGenerationStreamFetcher,
      onStartGenerationRun,
      onStartImageGeneration,
      savedRunStore,
    });

    // The run is restored from storage (no initialRuns), and the composite is
    // derived immediately from the persisted image selection id plus the baked
    // template — never from stored picture bytes.
    const finalArea = await screen.findByRole("region", {
      name: /final quote tweet image creative result area/i,
    });

    expect(within(finalArea).getByText(fallbackStamp)).toBeInTheDocument();
    expect(within(finalArea).getByRole("img", { name: selectedVariationName })).toBeInTheDocument();

    // Reopening is pure rendering: nothing is regenerated.
    expect(onStartGenerationRun).not.toHaveBeenCalled();
    expect(onStartImageGeneration).not.toHaveBeenCalled();
    expect(imageGenerationStreamFetcher).not.toHaveBeenCalled();
    expect(generationStreamUrls).toHaveLength(0);
  });

  test("reopening a saved run missing a pick shows the quiet empty state naming the missing pick", async () => {
    const savedRunStore = createMemorySavedRunStore([
      buildCompletedV3Run({ selectedGeneratedImage: null }),
    ]);

    renderWorkspace({ savedRunStore });

    const finalArea = await screen.findByRole("region", {
      name: /final quote tweet image creative result area/i,
    });

    expect(
      within(finalArea).getByText(
        "Select a generated image to assemble the final quote tweet image.",
      ),
    ).toHaveRole("status");
    expect(
      screen.queryByRole("button", { name: /download final quote tweet image/i }),
    ).not.toBeInTheDocument();
  });

  test("keeps the overlay hidden when no image set with variations exists", () => {
    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [buildCompletedRun()],
    });

    // The run renders its drafts...
    expect(screen.getByRole("region", { name: /completed draft stack/i })).toBeInTheDocument();
    // ...but with no Image Set there is nothing to assemble, so the overlay stays hidden.
    expect(
      screen.queryByRole("region", { name: /final quote tweet image creative result area/i }),
    ).not.toBeInTheDocument();
  });

  test("collapses the overlay to its strip and reopens it from the workspace", async () => {
    const user = userEvent.setup();

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [buildCompletedV3Run({ selectedGeneratedImage: selectedGeneratedImageFixture })],
    });

    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /collapse final quote tweet image/i }));

    expect(
      screen.queryByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /expand final quote tweet image/i }));

    expect(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    ).toBeInTheDocument();
  });

  test("downloads the composite through the rasterizer injected into the workspace", async () => {
    const user = userEvent.setup();
    const rasterizeComposite = vi.fn(async (_node: HTMLElement) => "data:image/png;base64,final");
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);

    renderWorkspace({
      initialActiveRunId: "saved-run",
      initialRuns: [
        buildCompletedV3Run({
          label: "Drafts: OpenAI's GPU/teardown",
          selectedGeneratedImage: selectedGeneratedImageFixture,
        }),
      ],
      rasterizeComposite,
    });

    await user.click(screen.getByRole("button", { name: /download final quote tweet image/i }));

    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(rasterizeComposite).toHaveBeenCalledWith(
      screen.getByRole("figure", { name: "Final Quote Tweet Image preview" }),
    );

    const offeredAnchor = anchorClick.mock.contexts[0] as HTMLAnchorElement;

    expect(offeredAnchor.download).toBe("drafts-openai-s-gpu-teardown");
    expect(offeredAnchor.href).toBe("data:image/png;base64,final");

    anchorClick.mockRestore();
  });
});
