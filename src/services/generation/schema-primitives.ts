import { z } from "zod";

export const nonEmptyTrimmedStringSchema = z.string().trim().min(1);

export const runLocalIdSchema = z
  .string()
  .min(1)
  .refine((value) => !/^https?:\/\//i.test(value), {
    message: "Expected a run-local ID, not a raw URL.",
  });
