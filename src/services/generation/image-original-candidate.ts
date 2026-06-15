import { z } from "zod";
import type { SourceTweetMediaReference } from "@/services/tweet-retrieval";
import type { NewsLinkedImage } from "./news-linked-image";
import { nonEmptyTrimmedStringSchema, runLocalIdSchema } from "./schema-primitives";

/** A run offers exactly this many Image Original Candidates for selection. */
export const imageOriginalCandidateTarget = 4;

export const imageOriginalCandidateOriginSchema = z.enum([
  "source-tweet-media",
  "news-linked-image",
]);

export const imageOriginalCandidateSchema = z
  .object({
    id: runLocalIdSchema,
    origin: imageOriginalCandidateOriginSchema,
    url: z.string().url(),
    previewUrl: z.string().url().optional(),
    altText: nonEmptyTrimmedStringSchema.optional(),
    sourceUrl: z.string().url().optional(),
    title: nonEmptyTrimmedStringSchema.optional(),
  })
  .strict();

export type ImageOriginalCandidate = z.infer<typeof imageOriginalCandidateSchema>;

/**
 * Source Tweet media is usable as an Image Original Candidate only when it is a
 * still image — videos and GIFs cannot stand in as the original input to image
 * generation.
 */
function isUsableSourceTweetImage(media: SourceTweetMediaReference) {
  return media.kind === "image";
}

function toSourceTweetMediaCandidate(media: SourceTweetMediaReference): ImageOriginalCandidate {
  return imageOriginalCandidateSchema.parse({
    id: `source-tweet-media-candidate-${media.id}`,
    origin: "source-tweet-media",
    url: media.url,
    previewUrl: media.previewUrl,
    altText: media.altText,
  });
}

function toNewsLinkedImageCandidate(image: NewsLinkedImage): ImageOriginalCandidate {
  return imageOriginalCandidateSchema.parse({
    id: `news-linked-image-candidate-${image.id}`,
    origin: "news-linked-image",
    url: image.url,
    altText: image.altText,
    sourceUrl: image.sourceUrl,
    title: image.title,
  });
}

/**
 * Pure top-up over (source-tweet media, news-linked images) → up to four Image
 * Original Candidates. Source Tweet usable images come first in their original
 * order; News-Linked Images fill only the remaining slots, and the top-up does
 * not run at all once the Source Tweet already supplies four usable images.
 */
export function assembleImageOriginalCandidates({
  newsLinkedImages,
  sourceTweetMedia,
}: {
  newsLinkedImages: readonly NewsLinkedImage[];
  sourceTweetMedia: readonly SourceTweetMediaReference[];
}): ImageOriginalCandidate[] {
  const candidates = sourceTweetMedia
    .filter(isUsableSourceTweetImage)
    .slice(0, imageOriginalCandidateTarget)
    .map(toSourceTweetMediaCandidate);

  for (const newsLinkedImage of newsLinkedImages) {
    if (candidates.length >= imageOriginalCandidateTarget) {
      break;
    }

    candidates.push(toNewsLinkedImageCandidate(newsLinkedImage));
  }

  return candidates;
}
