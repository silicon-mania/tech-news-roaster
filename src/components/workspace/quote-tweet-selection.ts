import type {
  ImageSet,
  SelectedGeneratedImage,
  SelectedVisualJoke,
  VisualJoke,
  VisualJokeSet,
} from "@/services/generation";

/**
 * Resolves the run's two picks against its generated content. The Final Quote
 * Tweet Image is derived purely from these — only a Selected Generated Image
 * that is a `variation` (never the original) and a Selected Visual Joke can
 * assemble the composite. Shared by the overlay and its tests.
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

export function findSelectedVisualJoke(
  visualJokeSet: VisualJokeSet | undefined,
  selection: SelectedVisualJoke,
): VisualJoke | null {
  if (!visualJokeSet || !selection) {
    return null;
  }

  return visualJokeSet.jokes.find((joke) => joke.id === selection.visualJokeId) ?? null;
}

export function getMissingPickMessage({
  isImageMissing,
  isJokeMissing,
}: {
  isImageMissing: boolean;
  isJokeMissing: boolean;
}) {
  if (isImageMissing && isJokeMissing) {
    return "Select a generated image and a visual joke to assemble the final quote tweet image.";
  }

  if (isImageMissing) {
    return "Select a generated image to assemble the final quote tweet image.";
  }

  return "Select a visual joke to assemble the final quote tweet image.";
}
