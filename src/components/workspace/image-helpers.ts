import type { ImageModelProvenance, ImageOriginalCandidate, ImageSet } from "@/services/generation";

export function getImageTitle(candidate: ImageOriginalCandidate, index: number) {
  if (candidate.title) {
    return candidate.title;
  }

  return candidate.origin === "source-tweet-media"
    ? `Source tweet image ${index + 1}`
    : `News-linked image ${index + 1}`;
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

export function getDisplayImageUrl(candidate: ImageOriginalCandidate, index: number) {
  // Prefer the lighter preview for the selection thumbnail when the candidate carries one.
  const displayUrl = candidate.previewUrl ?? candidate.url;

  // Local fixtures use example.com hosts that have no real bytes; swap them for a
  // deterministic placeholder so the selection grid renders in offline dev runs.
  if (/^https:\/\/([a-z0-9-]+\.)*example\.com\//.test(displayUrl)) {
    return `https://picsum.photos/seed/${encodeURIComponent(
      candidate.id || `image-${index + 1}`,
    )}/320/240`;
  }

  return displayUrl;
}
