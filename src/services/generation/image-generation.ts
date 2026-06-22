import { z } from "zod";
import {
  type ImageOriginalCandidate,
  imageOriginalCandidateOriginSchema,
  imageOriginalCandidateSchema,
  imageOriginalCandidateTarget,
} from "./image-original-candidate";
import { generationRunPhaseSchema } from "./run-phase";
import { nonEmptyTrimmedStringSchema, runLocalIdSchema } from "./schema-primitives";

export const selectedImageOriginalSchema = z
  .object({
    id: runLocalIdSchema,
    candidateId: runLocalIdSchema,
    origin: imageOriginalCandidateOriginSchema,
    url: z.string().url(),
    altText: nonEmptyTrimmedStringSchema.optional(),
    preparedAt: z.string().datetime(),
    sourceUrl: z.string().url().optional(),
    title: nonEmptyTrimmedStringSchema.optional(),
  })
  .strict();

export const imageModelProvenanceSchema = z
  .object({
    model: nonEmptyTrimmedStringSchema,
    provider: nonEmptyTrimmedStringSchema.optional(),
  })
  .strict();

const imageOptionKindSchema = z.enum(["original", "variation"]);

const imageOptionSchema = z
  .object({
    id: runLocalIdSchema,
    altText: nonEmptyTrimmedStringSchema.optional(),
    kind: imageOptionKindSchema,
    label: nonEmptyTrimmedStringSchema,
    url: z.string().url(),
  })
  .strict();

const originalImageOptionSchema = imageOptionSchema.extend({
  kind: z.literal("original"),
  label: z.literal("Original"),
});

const variationImageOptionSchema = imageOptionSchema.extend({
  kind: z.literal("variation"),
  label: z.enum(["Variation 1", "Variation 2", "Variation 3", "Variation 4"]),
});

export const imageSetSchema = z
  .object({
    id: runLocalIdSchema,
    completedAt: z.string().datetime(),
    imageModelProvenance: imageModelProvenanceSchema,
    options: z.tuple([
      originalImageOptionSchema,
      variationImageOptionSchema,
      variationImageOptionSchema,
      variationImageOptionSchema,
      variationImageOptionSchema,
    ]),
    selectedImageOriginal: selectedImageOriginalSchema,
  })
  .strict()
  .refine(
    (imageSet) =>
      imageSet.options[1].label === "Variation 1" &&
      imageSet.options[2].label === "Variation 2" &&
      imageSet.options[3].label === "Variation 3" &&
      imageSet.options[4].label === "Variation 4",
    {
      message: "Image Sets must contain Original and Variations 1 through 4.",
      path: ["options"],
    },
  );

export const selectedGeneratedImageSchema = z
  .object({
    imageOptionId: runLocalIdSchema,
    selectedAt: z.string().datetime(),
  })
  .strict();

export const failedImageSetSchema = z
  .object({
    id: runLocalIdSchema,
    failedAt: z.string().datetime(),
    message: nonEmptyTrimmedStringSchema,
    selectedImageId: runLocalIdSchema,
    selectedImageOriginal: selectedImageOriginalSchema.optional(),
    // Flat, human-readable failure detail for the Quiet Failure Details surface —
    // the error/cause chain (e.g. an AI Gateway timeout) plus the failing step.
    debugLog: z.array(z.string()).optional(),
  })
  .strict();

/**
 * One attempt in a run's ordered stack of Uploaded Image Sets (ADR-0025): the
 * operator uploads a single image and the server generates four variations from
 * it with the Default Image Prompt. Every attempt is retained — a completed set,
 * or a failure keeping its own Quiet Failure Details — so a run accumulates a
 * growing "Image set N" gallery. Reuses the `ImageSet` / `FailedImageSet` shapes
 * verbatim; an uploaded set's Selected Image Original carries origin
 * `'user-uploaded'` and is never an Image Original Candidate.
 */
export const uploadedImageSetEntrySchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("completed"),
      imageSet: imageSetSchema,
    })
    .strict(),
  z
    .object({
      status: z.literal("failed"),
      failedImageSet: failedImageSetSchema,
    })
    .strict(),
]);

const imageGenerationInputSchema = z
  .object({
    parentRunId: runLocalIdSchema,
    selectedImageId: runLocalIdSchema,
    userImagePrompt: nonEmptyTrimmedStringSchema,
  })
  .strict();

export const imageGenerationTerminalStateSchema = z
  .object({
    completedAt: z.string().datetime(),
    failedImageSet: failedImageSetSchema.optional(),
    imageSet: imageSetSchema.optional(),
    status: z.enum(["completed", "failed"]),
  })
  .strict()
  .refine(
    (state) =>
      state.status === "completed"
        ? Boolean(state.imageSet) && !state.failedImageSet
        : !state.imageSet && Boolean(state.failedImageSet),
    {
      message: "Terminal image-generation state must match its completed or failed image set.",
    },
  );

const imageGenerationAttemptBaseSchema = z
  .object({
    selectedImageId: runLocalIdSchema,
    startedAt: z.string().datetime(),
    userImagePrompt: nonEmptyTrimmedStringSchema,
  })
  .strict();

export const imageGenerationAttemptStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("not-started"),
    })
    .strict(),
  imageGenerationAttemptBaseSchema.extend({
    status: z.literal("running"),
  }),
  imageGenerationAttemptBaseSchema.extend({
    completedAt: z.string().datetime(),
    status: z.literal("completed"),
  }),
  imageGenerationAttemptBaseSchema.extend({
    completedAt: z.string().datetime(),
    status: z.literal("failed"),
  }),
]);

const imageGenerationParentRunSchema = z
  .object({
    id: runLocalIdSchema,
    failedImageSet: failedImageSetSchema.optional(),
    imageGenerationState: imageGenerationAttemptStateSchema.optional(),
    imageOriginalCandidates: z
      .array(imageOriginalCandidateSchema)
      .max(imageOriginalCandidateTarget)
      .optional(),
    imageSet: imageSetSchema.optional(),
    phase: generationRunPhaseSchema.optional(),
    selectedImageOriginal: selectedImageOriginalSchema.optional(),
  })
  .strict();

export type FailedImageSet = z.infer<typeof failedImageSetSchema>;
export type ImageGenerationInput = z.infer<typeof imageGenerationInputSchema>;
export type ImageGenerationParentRun = z.infer<typeof imageGenerationParentRunSchema>;
export type ImageModelProvenance = z.infer<typeof imageModelProvenanceSchema>;
export type ImageOption = z.infer<typeof imageOptionSchema>;
export type ImageSet = z.infer<typeof imageSetSchema>;
export type SelectedGeneratedImage = z.infer<typeof selectedGeneratedImageSchema> | null;
export type SelectedImageOriginal = z.infer<typeof selectedImageOriginalSchema>;
export type UploadedImageSetEntry = z.infer<typeof uploadedImageSetEntrySchema>;

export function parseImageGenerationInput(input: unknown): ImageGenerationInput {
  return imageGenerationInputSchema.parse(input);
}

export function parseImageGenerationParentRun(parentRun: unknown): ImageGenerationParentRun {
  return imageGenerationParentRunSchema.parse(parentRun);
}

function parseSelectedImageOriginal(original: unknown): SelectedImageOriginal {
  return selectedImageOriginalSchema.parse(original);
}

/**
 * Pure candidate → Selected Image Original mapping. The selection metadata (id,
 * candidateId, origin, url, alt/source/title, preparedAt) is fully determined by
 * the candidate plus the moment it was prepared — no bytes, no fetch. Shared by
 * the manual image-generation path (which additionally fetches the bytes that
 * feed generation) and by Automated Selection, which picks the first candidate
 * with no operator. Keeping one builder guarantees both paths shape the field
 * identically.
 */
export function selectedImageOriginalFromCandidate(
  candidate: ImageOriginalCandidate,
  preparedAt: string,
): SelectedImageOriginal {
  return parseSelectedImageOriginal({
    altText: candidate.altText,
    candidateId: candidate.id,
    id: `selected-original-${candidate.id}`,
    origin: candidate.origin,
    preparedAt,
    sourceUrl: candidate.sourceUrl,
    title: candidate.title,
    url: candidate.url,
  });
}

/**
 * Builds the Selected Image Original for an Uploaded Image Set (ADR-0025). Unlike
 * {@link selectedImageOriginalFromCandidate} there is no Image Original Candidate
 * — the operator supplies the bytes directly — so the origin is `'user-uploaded'`
 * and the ids are keyed off the upload. The `url` begins as the inline upload (a
 * `data:` URL) and is repointed at the stored original once its bytes are
 * persisted to owner storage.
 */
export function selectedImageOriginalFromUpload({
  altText,
  preparedAt,
  uploadId,
  url,
}: {
  altText?: string;
  preparedAt: string;
  uploadId: string;
  url: string;
}): SelectedImageOriginal {
  const candidateId = `uploaded-original-${uploadId}`;

  return parseSelectedImageOriginal({
    altText,
    candidateId,
    id: `selected-original-${candidateId}`,
    origin: "user-uploaded",
    preparedAt,
    url,
  });
}

export function parseImageSet(imageSet: unknown): ImageSet {
  return imageSetSchema.parse(imageSet);
}

export function parseFailedImageSet(failedImageSet: unknown): FailedImageSet {
  return failedImageSetSchema.parse(failedImageSet);
}

/**
 * A run's completed Image Sets in resolution order: the source-derived
 * `imageSet` first (when present), then each completed Uploaded Image Set in
 * upload order (ADR-0025). Selected Generated Image resolution and the "first
 * variation" default both walk this list, so any uploaded variation is
 * selectable and a run with only uploaded sets still resolves a default. For a
 * run carrying only the source-derived set this is `[imageSet]` — byte-for-byte
 * the prior behavior.
 */
export function collectCompletedImageSets(run: {
  imageSet?: ImageSet;
  uploadedImageSets?: readonly UploadedImageSetEntry[];
}): ImageSet[] {
  const imageSets: ImageSet[] = [];

  if (run.imageSet) {
    imageSets.push(run.imageSet);
  }

  for (const entry of run.uploadedImageSets ?? []) {
    if (entry.status === "completed") {
      imageSets.push(entry.imageSet);
    }
  }

  return imageSets;
}

export function parseSelectedGeneratedImage(
  selectedGeneratedImage: unknown,
  imageSets: readonly ImageSet[] = [],
): SelectedGeneratedImage {
  const selection = z.nullable(selectedGeneratedImageSchema).parse(selectedGeneratedImage);

  if (!selection || imageSets.length === 0) {
    return selection;
  }

  const isSelectableVariation = imageSets.some((imageSet) =>
    imageSet.options.some(
      (option) => option.id === selection.imageOptionId && option.kind === "variation",
    ),
  );

  return isSelectableVariation ? selection : null;
}
