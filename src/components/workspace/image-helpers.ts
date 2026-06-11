import type { ImageModelProvenance, ImageSet, NewsLinkedImage } from "@/services/generation";

export function getImageTitle(image: NewsLinkedImage, index: number) {
  return image.title ?? `News-linked image ${index + 1}`;
}

export function formatImageModelProvenance(provenance: ImageModelProvenance) {
  return provenance.model;
}

export function buildImageDownloadName(imageSet: ImageSet, option: ImageSet["options"][number]) {
  return `${imageSet.id}-${option.label.toLowerCase().replaceAll(" ", "-")}`;
}

export function buildFinalQuoteTweetImageDownloadName(runLabel: string) {
  // Run Labels are free text, so collapse anything filename-hostile too.
  const slug = runLabel
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

  return slug || "final-quote-tweet-image";
}

export function getDisplayImageUrl(image: NewsLinkedImage, index: number) {
  if (image.url.startsWith("https://example.com/")) {
    return `https://picsum.photos/seed/${encodeURIComponent(
      image.id || `image-${index + 1}`,
    )}/320/240`;
  }

  return image.url;
}
