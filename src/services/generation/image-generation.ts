import { z } from "zod";
import {
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
  })
  .strict();

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
  imageSet?: ImageSet,
): SelectedGeneratedImage {
  const selection = z.nullable(selectedGeneratedImageSchema).parse(selectedGeneratedImage);

  if (!selection || !imageSet) {
    return selection;
  }

  const isSelectableVariation = imageSet.options.some(
    (option) => option.id === selection.imageOptionId && option.kind === "variation",
  );

  return isSelectableVariation ? selection : null;
}
