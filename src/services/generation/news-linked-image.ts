import { z } from "zod";
import { nonEmptyTrimmedStringSchema, runLocalIdSchema } from "./schema-primitives";

export const newsLinkedImageSchema = z
  .object({
    id: runLocalIdSchema,
    url: z.string().url(),
    altText: nonEmptyTrimmedStringSchema.optional(),
    sourceUrl: z.string().url().optional(),
    title: nonEmptyTrimmedStringSchema.optional(),
  })
  .strict();

export type NewsLinkedImage = z.infer<typeof newsLinkedImageSchema>;
