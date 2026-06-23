import { z } from "zod";
import { imageGenerationAttemptStateSchema } from "./image-generation";
import { jokeContextSnapshotSchema } from "./joke-context";
import { newsLinkedImageSchema } from "./news-linked-image";
import { draftTarget } from "./providers";
import { nonEmptyTrimmedStringSchema } from "./schema-primitives";

const resultStageNotStartedSchema = z
  .object({
    status: z.literal("not-started"),
  })
  .strict();

const resultStageRunningSchema = z
  .object({
    startedAt: z.string().datetime(),
    status: z.literal("running"),
  })
  .strict();

const resultStageFailedSchema = z
  .object({
    debugLog: z.array(nonEmptyTrimmedStringSchema).optional(),
    failedAt: z.string().datetime(),
    message: nonEmptyTrimmedStringSchema,
    startedAt: z.string().datetime(),
    status: z.literal("failed"),
  })
  .strict();

const contextGatheringStateSchema = z.discriminatedUnion("status", [
  resultStageNotStartedSchema,
  resultStageRunningSchema,
  z
    .object({
      completedAt: z.string().datetime(),
      jokeContextSnapshot: jokeContextSnapshotSchema,
      startedAt: z.string().datetime(),
      status: z.literal("completed"),
    })
    .strict(),
  resultStageFailedSchema,
]);

const textGenerationStateSchema = z.discriminatedUnion("status", [
  resultStageNotStartedSchema,
  resultStageRunningSchema,
  z
    .object({
      completedAt: z.string().datetime(),
      draftCount: z.literal(draftTarget),
      startedAt: z.string().datetime(),
      status: z.literal("completed"),
    })
    .strict(),
  resultStageFailedSchema,
]);

const newsLinkedImageDiscoveryStateSchema = z.discriminatedUnion("status", [
  resultStageNotStartedSchema,
  resultStageRunningSchema,
  z
    .object({
      completedAt: z.string().datetime(),
      newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5),
      startedAt: z.string().datetime(),
      status: z.literal("completed"),
    })
    .strict(),
  resultStageFailedSchema,
]);

export const generationResultStatesSchema = z
  .object({
    contextGathering: contextGatheringStateSchema,
    imageGeneration: imageGenerationAttemptStateSchema,
    newsLinkedImageDiscovery: newsLinkedImageDiscoveryStateSchema,
    textGeneration: textGenerationStateSchema,
  })
  .strict()
  .superRefine((states, ctx) => {
    if (states.contextGathering.status === "completed") {
      return;
    }

    if (states.newsLinkedImageDiscovery.status !== "not-started") {
      ctx.addIssue({
        code: "custom",
        message:
          "News-Linked Image Discovery cannot start before Joke Context Gathering completes.",
        path: ["newsLinkedImageDiscovery"],
      });
    }

    if (states.textGeneration.status !== "not-started") {
      ctx.addIssue({
        code: "custom",
        message: "Text Generation cannot start before Joke Context Gathering completes.",
        path: ["textGeneration"],
      });
    }
  });

export type GenerationResultStates = z.infer<typeof generationResultStatesSchema>;

export function parseGenerationResultStates(input: unknown): GenerationResultStates {
  return generationResultStatesSchema.parse(input);
}

/**
 * The News Category classifier's terminal result-state (ADR-0027). It reuses the
 * per-area failed shape (timestamps, message, optional debug log) so it renders
 * through the same Quiet Failure Details surface, but it is deliberately NOT a
 * member of {@link generationResultStatesSchema}: a failed classification still
 * renders `VIRAL`, so it must never count toward — or against — the Successful
 * Run / Complete Run determination. It rides the saved run directly as
 * `newsCategoryClassification`. Only the two terminal shapes are persisted; the
 * step has no not-started/running states on a saved run.
 */
export const newsCategoryClassificationStateSchema = z.discriminatedUnion("status", [
  z
    .object({
      completedAt: z.string().datetime(),
      startedAt: z.string().datetime(),
      status: z.literal("completed"),
    })
    .strict(),
  resultStageFailedSchema,
]);
