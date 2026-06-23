import type { ImageSet, SelectedGeneratedImage } from "@/services/generation";

/**
 * Resolves the run's Selected Generated Image against its generated content. The
 * Final Quote Tweet Image is derived purely from this — only a Selected Generated
 * Image that is a `variation` (never the original) can assemble the composite.
 * Shared by the overlay and its tests.
 *
 * The variation is searched across every completed Image Set in resolution order
 * (`collectCompletedImageSets`: source-derived first, then uploaded sets), so an
 * uploaded variation resolves just like a source-derived one (ADR-0025).
 */
export function findSelectedVariation(
  imageSets: readonly ImageSet[],
  selection: SelectedGeneratedImage,
) {
  if (!selection) {
    return null;
  }

  for (const imageSet of imageSets) {
    const variation = imageSet.options.find(
      (option) => option.id === selection.imageOptionId && option.kind === "variation",
    );

    if (variation) {
      return variation;
    }
  }

  return null;
}
