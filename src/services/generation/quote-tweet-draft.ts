import { z } from "zod";
import { generationProviderIdSchema } from "./providers";
import { nonEmptyTrimmedStringSchema } from "./schema-primitives";

export const quoteTweetDraftSchema = z
  .object({
    id: nonEmptyTrimmedStringSchema,
    angle: nonEmptyTrimmedStringSchema,
    fallbackForProvider: generationProviderIdSchema.optional(),
    text: nonEmptyTrimmedStringSchema,
    modelProvenance: nonEmptyTrimmedStringSchema,
    provider: generationProviderIdSchema,
    visibleRationale: nonEmptyTrimmedStringSchema,
  })
  .strict();

export type QuoteTweetDraft = z.infer<typeof quoteTweetDraftSchema>;
