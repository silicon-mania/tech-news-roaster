import { z } from "zod";
import { newsLinkedImageSchema } from "./news-linked-image";
import { generationRunPhaseSchema } from "./run-phase";
import { nonEmptyTrimmedStringSchema, runLocalIdSchema } from "./schema-primitives";

export const selectedImageOriginalSchema = z
  .object({
    id: runLocalIdSchema,
    newsLinkedImageId: runLocalIdSchema,
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
  label: z.enum(["Variation 1", "Variation 2"]),
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
    ]),
    selectedImageOriginal: selectedImageOriginalSchema,
  })
  .strict()
  .refine(
    (imageSet) =>
      imageSet.options[1].label === "Variation 1" && imageSet.options[2].label === "Variation 2",
    {
      message: "Image Sets must contain Original, Variation 1, and Variation 2.",
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
  })
  .strict();

const selectedImageIdsSchema = z.array(runLocalIdSchema).min(1).max(2);

const imageGenerationInputSchema = z
  .object({
    parentRunId: runLocalIdSchema,
    selectedImageIds: selectedImageIdsSchema,
    userImagePrompt: nonEmptyTrimmedStringSchema,
  })
  .strict();

export const imageGenerationTerminalStateSchema = z
  .object({
    completedAt: z.string().datetime(),
    failedImageSets: z.array(failedImageSetSchema).max(2),
    imageSets: z.array(imageSetSchema).max(2),
    status: z.enum(["completed", "partially-failed", "failed"]),
  })
  .strict()
  .refine(
    (state) =>
      state.status === "partially-failed"
        ? state.imageSets.length > 0 && state.failedImageSets.length > 0
        : state.status === "completed"
          ? state.imageSets.length > 0 && state.failedImageSets.length === 0
          : state.imageSets.length === 0 && state.failedImageSets.length > 0,
    {
      message:
        "Terminal image-generation state must match completed, partially-failed, or failed set counts.",
    },
  );

const imageGenerationAttemptBaseSchema = z
  .object({
    selectedImageIds: selectedImageIdsSchema,
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
    status: z.literal("partially-failed"),
  }),
  imageGenerationAttemptBaseSchema.extend({
    completedAt: z.string().datetime(),
    status: z.literal("failed"),
  }),
]);

const imageGenerationParentRunSchema = z
  .object({
    id: runLocalIdSchema,
    failedImageSets: z.array(failedImageSetSchema).max(2).optional(),
    imageGenerationState: imageGenerationAttemptStateSchema.optional(),
    imageSets: z.array(imageSetSchema).max(2).optional(),
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5).optional(),
    phase: generationRunPhaseSchema.optional(),
    selectedImageOriginals: z.array(selectedImageOriginalSchema).max(2).optional(),
  })
  .strict();

export type FailedImageSet = z.infer<typeof failedImageSetSchema>;
export type ImageGenerationInput = z.infer<typeof imageGenerationInputSchema>;
export type ImageGenerationParentRun = z.infer<typeof imageGenerationParentRunSchema>;
export type ImageModelProvenance = z.infer<typeof imageModelProvenanceSchema>;
export type ImageSet = z.infer<typeof imageSetSchema>;
export type SelectedGeneratedImage = z.infer<typeof selectedGeneratedImageSchema> | null;
export type SelectedImageOriginal = z.infer<typeof selectedImageOriginalSchema>;

export function parseImageGenerationInput(input: unknown): ImageGenerationInput {
  return imageGenerationInputSchema.parse(input);
}

export function parseImageGenerationParentRun(parentRun: unknown): ImageGenerationParentRun {
  return imageGenerationParentRunSchema.parse(parentRun);
}

export function parseSelectedImageOriginal(original: unknown): SelectedImageOriginal {
  return selectedImageOriginalSchema.parse(original);
}

export function parseImageSet(imageSet: unknown): ImageSet {
  return imageSetSchema.parse(imageSet);
}

export function parseFailedImageSet(failedImageSet: unknown): FailedImageSet {
  return failedImageSetSchema.parse(failedImageSet);
}

export function parseSelectedGeneratedImage(
  selectedGeneratedImage: unknown,
  imageSets?: ImageSet[],
): SelectedGeneratedImage {
  const selection = z.nullable(selectedGeneratedImageSchema).parse(selectedGeneratedImage);

  if (!selection || !imageSets) {
    return selection;
  }

  const isSelectableVariation = imageSets.some((imageSet) =>
    imageSet.options.some(
      (option) => option.id === selection.imageOptionId && option.kind === "variation",
    ),
  );

  return isSelectableVariation ? selection : null;
}
