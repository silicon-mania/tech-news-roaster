"use client";

import type { FailedImageSet, ImageSet, UploadedImageSetEntry } from "@/services/generation";
import { FailedImageSetArticle } from "./failed-image-set-article";
import { ImageSetArticle } from "./image-set-article";
import { PendingImageSet } from "./pending-image-set";

type StackEntry =
  | { kind: "completed"; imageSet: ImageSet }
  | { kind: "failed"; failedImageSet: FailedImageSet };

/**
 * The run's stack of Image Sets (ADR-0025): the source-derived set first (when
 * present — its completed set, or its retained failure when generation failed),
 * then each Uploaded Image Set in upload order — completed or retained failure —
 * newest at the bottom. Every set is labeled uniformly "Image set N" by stack
 * position (no titles, no timestamps), and a pending placeholder set sits at the
 * very bottom while a generation is in flight. Only variations are selectable as
 * the single run-wide Selected Generated Image; the resolver searches across sets,
 * so an uploaded variation is chosen exactly like a source-derived one.
 *
 * Surface-agnostic: both the Selected Run sidebar and the workspace render the same
 * stack, differing only in where the upload trigger and persistence live.
 */
export function ImageSetStack({
  isGenerationPending,
  onSelectedGeneratedImageChange,
  run,
  selectedGeneratedImageOptionId,
}: {
  isGenerationPending: boolean;
  onSelectedGeneratedImageChange: (imageOptionId: string | null) => void;
  run: {
    imageSet?: ImageSet;
    failedImageSet?: FailedImageSet;
    uploadedImageSets?: readonly UploadedImageSetEntry[];
  };
  selectedGeneratedImageOptionId: string | null;
}) {
  const entries: StackEntry[] = [];

  // The source-derived set occupies the first position when it exists — its
  // completed set, or (image generation either succeeds or fails) its retained
  // failure — so its uniform "Image set 1" label is stable across surfaces.
  if (run.imageSet) {
    entries.push({ imageSet: run.imageSet, kind: "completed" });
  } else if (run.failedImageSet) {
    entries.push({ failedImageSet: run.failedImageSet, kind: "failed" });
  }

  for (const entry of run.uploadedImageSets ?? []) {
    entries.push(
      entry.status === "completed"
        ? { imageSet: entry.imageSet, kind: "completed" }
        : { failedImageSet: entry.failedImageSet, kind: "failed" },
    );
  }

  return (
    <section aria-label="Image results area" className="grid gap-4">
      {entries.map((entry, index) => {
        const heading = `Image set ${index + 1}`;

        return entry.kind === "completed" ? (
          <ImageSetArticle
            heading={heading}
            imageSet={entry.imageSet}
            key={entry.imageSet.id}
            onSelectedGeneratedImageChange={onSelectedGeneratedImageChange}
            selectedGeneratedImageOptionId={selectedGeneratedImageOptionId}
          />
        ) : (
          <FailedImageSetArticle
            failedImageSet={entry.failedImageSet}
            heading={heading}
            key={entry.failedImageSet.id}
          />
        );
      })}
      {isGenerationPending ? <PendingImageSet /> : null}
    </section>
  );
}
