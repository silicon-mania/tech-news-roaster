import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";
import { type ImageSet, parseFailedImageSet, parseImageSet } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import {
  buildCompletedV3Run,
  buildImageGenerationStreamResponse,
  createMemorySavedRunStore,
} from "../workspace/workspace-test-utils";
import { RunsFeed } from "./runs-feed";

// jsdom has no IntersectionObserver; the feed wires one for append-on-scroll.
class NoopIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

const uploadStreamUrl = "/api/generation-runs/image-generation/upload";
// buildCompletedV3Run's source-derived set is built from the first news-linked
// image ("Launch visual"); with no explicit selection the card falls back to its
// first generated variation.
const firstSourceVariationAlt = "Launch visual variation 1.";

function buildUploadedImageSet(uploadId = "upload-1"): ImageSet {
  const setId = `uploaded-image-set-${uploadId}`;

  return parseImageSet({
    completedAt: "2026-06-06T11:05:00.000Z",
    id: setId,
    imageModelProvenance: { model: "mock-image-model", provider: "local" },
    options: [
      {
        altText: "Uploaded original.",
        id: `${setId}-original`,
        kind: "original",
        label: "Original",
        url: "https://example.com/uploaded-original.png",
      },
      ...Array.from({ length: 4 }, (_, index) => ({
        altText: `Uploaded variation ${index + 1}.`,
        id: `${setId}-variation-${index + 1}`,
        kind: "variation" as const,
        label: `Variation ${index + 1}`,
        url: `https://example.com/uploaded-variation-${index + 1}.png`,
      })),
    ],
    selectedImageOriginal: {
      altText: "Uploaded original.",
      candidateId: `uploaded-original-${uploadId}`,
      id: `selected-original-uploaded-original-${uploadId}`,
      origin: "user-uploaded",
      preparedAt: "2026-06-06T11:04:00.000Z",
      url: "https://example.com/uploaded-original.png",
    },
  });
}

function buildUploadedFailedImageSet(uploadId = "upload-1") {
  return parseFailedImageSet({
    debugLog: ["Step: generate-variations", "Image model: local/mock-image-model"],
    failedAt: "2026-06-06T11:05:00.000Z",
    id: `failed-uploaded-image-set-${uploadId}`,
    message: "The configured image model failed for the uploaded original.",
    selectedImageId: `uploaded-original-${uploadId}`,
    selectedImageOriginal: {
      altText: "Uploaded original photo.",
      candidateId: `uploaded-original-${uploadId}`,
      id: `selected-original-uploaded-original-${uploadId}`,
      origin: "user-uploaded",
      preparedAt: "2026-06-06T11:04:00.000Z",
      url: "https://example.com/uploaded-original.png",
    },
  });
}

function completedUploadResponse(imageSet: ImageSet) {
  return buildImageGenerationStreamResponse([
    { imageSet, type: "image-set-completed" },
    {
      state: { completedAt: "2026-06-06T11:05:00.000Z", imageSet, status: "completed" },
      type: "image-generation-completed",
    },
  ]);
}

function buildRun(overrides: Partial<GenerationRun> = {}): GenerationRun {
  return buildCompletedV3Run({
    id: "complete-run-1",
    label: "Complete run 1",
    savedAt: "2026-06-06T11:01:00.000Z",
    ...overrides,
  });
}

function renderFeed(
  runs: GenerationRun[],
  uploadImageFetcher: typeof fetch,
  { withToaster = false }: { withToaster?: boolean } = {},
) {
  const savedRunStore = createMemorySavedRunStore(runs);

  render(
    <>
      <RunsFeed savedRunStore={savedRunStore} uploadImageFetcher={uploadImageFetcher} />
      {withToaster ? <Toaster /> : null}
    </>,
  );

  return savedRunStore;
}

function getSidebar() {
  return screen.getByRole("complementary", { name: "Selected run" });
}

function getImageSection() {
  return within(getSidebar()).getByRole("region", { name: "Image" });
}

function getFeedCard() {
  return within(screen.getByRole("region", { name: "Runs" })).getByRole("article");
}

async function openSidebar(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: /open complete run 1/i }));
  await screen.findByRole("region", { name: /completed draft stack/i });
}

function pngFile() {
  return new File(["uploaded-bytes"], "photo.png", { type: "image/png" });
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", NoopIntersectionObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Selected Run sidebar uploader", () => {
  test("the upload trigger is an icon-only ghost button with a tooltip", async () => {
    const user = userEvent.setup();
    renderFeed([buildRun()], vi.fn());

    await openSidebar(user);

    // The trigger is a single labeled button (no visible text) in the Image header.
    const trigger = within(getImageSection()).getByRole("button", {
      name: "Upload your own image",
    });
    expect(trigger).not.toBeDisabled();
    expect(trigger).toHaveTextContent("");
    // Picker accepts the four image formats, one file (ADR-0025).
    const picker = within(getImageSection()).getByLabelText("Upload your own image file");
    expect(picker).toHaveAttribute("accept", ".jpg,.jpeg,.png,.webp");
    expect(picker).not.toHaveAttribute("multiple");
  });

  test("uploading appends a completed Image set 2 below the source set and persists it", async () => {
    const user = userEvent.setup();
    const uploadedSet = buildUploadedImageSet();
    const uploadImageFetcher = vi.fn(async () => completedUploadResponse(uploadedSet));
    const savedRunStore = renderFeed([buildRun()], uploadImageFetcher);

    await openSidebar(user);

    // Only the source-derived set exists before uploading.
    expect(within(getImageSection()).getByRole("article", { name: "Image set 1" })).toBeVisible();
    expect(
      within(getImageSection()).queryByRole("article", { name: "Image set 2" }),
    ).not.toBeInTheDocument();

    await user.upload(
      within(getImageSection()).getByLabelText("Upload your own image file"),
      pngFile(),
    );

    // It posts the file to the upload stream route.
    expect(uploadImageFetcher).toHaveBeenCalledWith(
      uploadStreamUrl,
      expect.objectContaining({ method: "POST" }),
    );

    // The completed Uploaded Image Set lands as "Image set 2" with four variations.
    const set2 = await within(getImageSection()).findByRole("article", { name: "Image set 2" });
    expect(within(set2).getByText("Variation 1")).toBeInTheDocument();
    expect(within(set2).getByText("Variation 4")).toBeInTheDocument();

    // Newest set is at the bottom (after the source-derived set in the DOM).
    const set1 = within(getImageSection()).getByRole("article", { name: "Image set 1" });
    expect(set1.compareDocumentPosition(set2) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The whole run payload is persisted (sidebar immediate save) with the entry.
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "complete-run-1",
          uploadedImageSets: [{ imageSet: uploadedSet, status: "completed" }],
        }),
      ),
    );
  });

  test("disables the trigger and shows a pending skeleton while a generation is in flight", async () => {
    const user = userEvent.setup();
    let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;
    const encoder = new TextEncoder();
    const uploadImageFetcher = vi.fn(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              streamController = controller;
            },
          }),
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    );
    renderFeed([buildRun()], uploadImageFetcher);

    await openSidebar(user);
    await user.upload(
      within(getImageSection()).getByLabelText("Upload your own image file"),
      pngFile(),
    );

    // Mid-flight: the trigger is disabled and a pending skeleton set is shown.
    await waitFor(() =>
      expect(
        within(getImageSection()).getByRole("button", { name: "Upload your own image" }),
      ).toBeDisabled(),
    );
    expect(within(getImageSection()).getByLabelText(/pending image set/i)).toBeInTheDocument();

    const uploadedSet = buildUploadedImageSet();

    act(() => {
      streamController?.enqueue(
        encoder.encode(
          `event: image-generation-completed\ndata: ${JSON.stringify({
            state: {
              completedAt: "2026-06-06T11:05:00.000Z",
              imageSet: uploadedSet,
              status: "completed",
            },
            type: "image-generation-completed",
          })}\n\n`,
        ),
      );
      streamController?.close();
    });

    // Once it resolves, the skeleton is gone and the trigger is enabled again.
    await waitFor(() =>
      expect(
        within(getImageSection()).queryByLabelText(/pending image set/i),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(getImageSection()).getByRole("button", { name: "Upload your own image" }),
    ).not.toBeDisabled();
  });

  test("selecting an uploaded variation updates the run-wide selection and the card; originals are not selectable", async () => {
    const user = userEvent.setup();
    const uploadedSet = buildUploadedImageSet();
    const uploadImageFetcher = vi.fn(async () => completedUploadResponse(uploadedSet));
    const savedRunStore = renderFeed([buildRun()], uploadImageFetcher);

    await openSidebar(user);
    await user.upload(
      within(getImageSection()).getByLabelText("Upload your own image file"),
      pngFile(),
    );

    const set2 = await within(getImageSection()).findByRole("article", { name: "Image set 2" });

    // The card starts on the source set's first variation (Automated Selection).
    expect(within(getFeedCard()).getByAltText(firstSourceVariationAlt)).toBeInTheDocument();
    // The uploaded original carries no Select control.
    expect(within(set2).queryByRole("button", { name: "Select Original" })).not.toBeInTheDocument();

    await user.click(within(set2).getByRole("button", { name: "Select Variation 1" }));

    // The cross-set selection persists immediately...
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedGeneratedImage: expect.objectContaining({
            imageOptionId: "uploaded-image-set-upload-1-variation-1",
          }),
        }),
      ),
    );
    // ...and the card's Final Quote Tweet Image swaps to the uploaded variation.
    expect(within(getFeedCard()).getByAltText("Uploaded variation 1.")).toBeInTheDocument();
    expect(within(getFeedCard()).queryByAltText(firstSourceVariationAlt)).not.toBeInTheDocument();
  });

  test("uploaded variations open full-screen and download with non-colliding filenames", async () => {
    const user = userEvent.setup();
    const uploadedSet = buildUploadedImageSet();
    const uploadImageFetcher = vi.fn(async () => completedUploadResponse(uploadedSet));
    renderFeed([buildRun()], uploadImageFetcher);

    await openSidebar(user);
    await user.upload(
      within(getImageSection()).getByLabelText("Upload your own image file"),
      pngFile(),
    );

    const set1 = within(getImageSection()).getByRole("article", { name: "Image set 1" });
    const set2 = await within(getImageSection()).findByRole("article", { name: "Image set 2" });

    // Same label across sets, but the download filename keys off each set's id.
    const set1Download = within(set1).getByRole("link", { name: "Download Variation 1" });
    const set2Download = within(set2).getByRole("link", { name: "Download Variation 1" });
    expect(set1Download.getAttribute("download")).not.toBe(set2Download.getAttribute("download"));
    expect(set2Download).toHaveAttribute("download", "uploaded-image-set-upload-1-variation-1");

    // The uploaded variation opens full-screen.
    await user.click(within(set2).getByRole("button", { name: "Open Variation 1" }));
    expect(screen.getByRole("dialog", { name: /variation 1 image option/i })).toBeInTheDocument();
  });

  test("a failed upload is retained as a failed set with its quiet failure reveal, original, and a toast", async () => {
    const user = userEvent.setup();
    const failedSet = buildUploadedFailedImageSet();
    const uploadImageFetcher = vi.fn(async () =>
      buildImageGenerationStreamResponse([
        { failedImageSet: failedSet, type: "image-set-failed" },
        {
          state: {
            completedAt: "2026-06-06T11:05:00.000Z",
            failedImageSet: failedSet,
            status: "failed",
          },
          type: "image-generation-completed",
        },
      ]),
    );
    const savedRunStore = renderFeed([buildRun()], uploadImageFetcher, { withToaster: true });

    await openSidebar(user);
    await user.upload(
      within(getImageSection()).getByLabelText("Upload your own image file"),
      pngFile(),
    );

    const failedArticle = await within(getImageSection()).findByRole("article", {
      name: "Image set 2",
    });
    expect(within(failedArticle).getByText("Image set failed")).toBeInTheDocument();
    // The uploaded original is still shown, so the failure can be correlated to it.
    expect(within(failedArticle).getByAltText("Uploaded original photo.")).toBeInTheDocument();

    // A non-blocking toast confirms the failure (no blocking dialog).
    expect(
      await screen.findByText("Couldn't generate from your uploaded image"),
    ).toBeInTheDocument();

    // Each failed set carries its own Quiet Failure Details behind the quiet reveal.
    await user.click(
      within(failedArticle).getByRole("button", {
        name: "Open Quiet Failure Details for Image set 2",
      }),
    );
    expect(screen.getByRole("dialog", { name: /quiet failure details/i })).toHaveTextContent(
      "The configured image model failed for the uploaded original.",
    );

    // The retained failure is persisted on the run payload.
    await waitFor(() =>
      expect(savedRunStore.save).toHaveBeenCalledWith(
        expect.objectContaining({
          uploadedImageSets: [{ failedImageSet: failedSet, status: "failed" }],
        }),
      ),
    );
  });

  test("uploaded sets and the selection survive reopening the run", async () => {
    const user = userEvent.setup();
    const uploadedSet = buildUploadedImageSet();
    const uploadImageFetcher = vi.fn(async () => completedUploadResponse(uploadedSet));
    renderFeed([buildRun()], uploadImageFetcher);

    await openSidebar(user);
    await user.upload(
      within(getImageSection()).getByLabelText("Upload your own image file"),
      pngFile(),
    );

    const set2 = await within(getImageSection()).findByRole("article", { name: "Image set 2" });
    await user.click(within(set2).getByRole("button", { name: "Select Variation 2" }));
    await within(set2).findByRole("button", { name: "Clear Variation 2 selection" });

    // Close and reopen the run from the feed.
    await user.click(within(getSidebar()).getByRole("button", { name: /close selected run/i }));
    await openSidebar(user);

    // The uploaded set is still stacked and its variation is still selected.
    const reopenedSet2 = within(getImageSection()).getByRole("article", { name: "Image set 2" });
    expect(
      within(reopenedSet2).getByRole("button", { name: "Clear Variation 2 selection" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("rejects an over-cap file with a quiet toast and never uploads", async () => {
    const user = userEvent.setup();
    const uploadImageFetcher = vi.fn();
    renderFeed([buildRun()], uploadImageFetcher, { withToaster: true });

    await openSidebar(user);

    // An 11 MB file is over the ~10 MB cap.
    const tooLarge = new File([new Uint8Array(11 * 1024 * 1024)], "huge.png", {
      type: "image/png",
    });
    await user.upload(
      within(getImageSection()).getByLabelText("Upload your own image file"),
      tooLarge,
    );

    expect(await screen.findByText("That image is too large (max 10 MB)")).toBeInTheDocument();
    expect(uploadImageFetcher).not.toHaveBeenCalled();
  });
});
