import { z } from "zod";
import { retrievedSourceTweetSchema } from "@/services/tweet-retrieval";
import {
  failedImageSetSchema,
  imageGenerationAttemptStateSchema,
  imageModelProvenanceSchema,
  imageSetSchema,
  selectedImageOriginalSchema,
} from "./image-generation";
import { jokeContextSnapshotSchema } from "./joke-context";
import { newsLinkedImageSchema } from "./news-linked-image";
import { draftTarget } from "./providers";
import { quoteTweetDraftSchema } from "./quote-tweet-draft";
import { type GenerationResultStates, generationResultStatesSchema } from "./result-states";
import { generationRunPhaseSchema } from "./run-phase";
import { nonEmptyTrimmedStringSchema, runLocalIdSchema } from "./schema-primitives";
import {
  selectedVisualJokeSchema,
  visualJokeDirectionTextSchema,
  visualJokeSetSchema,
} from "./visual-joke";

function countSuccessfulCreativeResultAreas(states: GenerationResultStates) {
  let successCount = 0;

  if (states.textGeneration.status === "completed") {
    successCount += 1;
  }

  if (states.newsLinkedImageDiscovery.status === "completed") {
    successCount += 1;
  }

  if (states.visualJokeGeneration.status === "completed") {
    successCount += 1;
  }

  return successCount;
}

function addSelectedVisualJokeIssues(
  run: {
    selectedVisualJoke?: z.infer<typeof selectedVisualJokeSchema> | null;
    visualJokeSet?: z.infer<typeof visualJokeSetSchema>;
  },
  ctx: z.RefinementCtx,
) {
  if (!run.selectedVisualJoke) {
    return;
  }

  if (!run.visualJokeSet) {
    ctx.addIssue({
      code: "custom",
      message: "Selected Visual Joke requires a Visual Joke Set.",
      path: ["selectedVisualJoke"],
    });
    return;
  }

  if (!run.visualJokeSet.jokes.some((joke) => joke.id === run.selectedVisualJoke?.visualJokeId)) {
    ctx.addIssue({
      code: "custom",
      message: "Selected Visual Joke must belong to the run's Visual Joke Set.",
      path: ["selectedVisualJoke", "visualJokeId"],
    });
  }
}

function addCompletedRunOutputIssues({
  draftsLength,
  generationResultStates,
  ctx,
}: {
  draftsLength: number;
  generationResultStates?: GenerationResultStates;
  ctx: z.RefinementCtx;
}) {
  if (!generationResultStates) {
    if (draftsLength !== draftTarget) {
      ctx.addIssue({
        code: "custom",
        message: "A completed Generation Run must have three drafts.",
        path: ["drafts"],
      });
    }

    return;
  }

  if (generationResultStates.contextGathering.status !== "completed") {
    ctx.addIssue({
      code: "custom",
      message: "A successful Generation Run requires completed Joke Context Gathering.",
      path: ["generationResultStates", "contextGathering"],
    });
  }

  if (countSuccessfulCreativeResultAreas(generationResultStates) === 0) {
    ctx.addIssue({
      code: "custom",
      message: "A successful Generation Run requires at least one successful creative result area.",
      path: ["generationResultStates"],
    });
  }

  if (generationResultStates.textGeneration.status === "completed") {
    if (draftsLength !== draftTarget) {
      ctx.addIssue({
        code: "custom",
        message: "Completed Text Generation requires exactly three drafts.",
        path: ["drafts"],
      });
    }

    return;
  }

  if (draftsLength > 0) {
    ctx.addIssue({
      code: "custom",
      message: "Drafts cannot be present when Text Generation did not complete successfully.",
      path: ["drafts"],
    });
  }
}

export const completedGenerationRunPayloadSchema = z
  .object({
    fallbackDisclosure: nonEmptyTrimmedStringSchema.optional(),
    generationResultStates: generationResultStatesSchema.optional(),
    jokeContextSnapshot: jokeContextSnapshotSchema.optional(),
    label: nonEmptyTrimmedStringSchema,
    sourceTweet: retrievedSourceTweetSchema,
    drafts: z.array(quoteTweetDraftSchema).max(draftTarget),
    imageGenerationState: imageGenerationAttemptStateSchema.optional(),
    imageModelProvenance: imageModelProvenanceSchema.optional(),
    imageSets: z.array(imageSetSchema).max(2).optional(),
    failedImageSets: z.array(failedImageSetSchema).max(2).optional(),
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5).optional(),
    phase: generationRunPhaseSchema.optional(),
    selectedVisualJoke: selectedVisualJokeSchema.nullable().optional(),
    selectedImageOriginals: z.array(selectedImageOriginalSchema).max(2).optional(),
    visualJokeDirection: visualJokeDirectionTextSchema.optional(),
    visualJokeSet: visualJokeSetSchema.optional(),
  })
  .strict()
  .superRefine((run, ctx) => {
    addCompletedRunOutputIssues({
      ctx,
      draftsLength: run.drafts.length,
      generationResultStates: run.generationResultStates,
    });

    addSelectedVisualJokeIssues(run, ctx);
  });

const savedGenerationRunSchema = z
  .object({
    id: runLocalIdSchema,
    jokeContextSnapshot: jokeContextSnapshotSchema.optional(),
    label: nonEmptyTrimmedStringSchema,
    sourceTweetUrl: z.string().url(),
    usersDirection: z.string(),
    status: z.enum(["running", "completed", "failed"]),
    draftCount: z.number().int().nonnegative(),
    draftTarget: z.literal(draftTarget),
    drafts: z.array(quoteTweetDraftSchema).max(draftTarget),
    failureMessage: nonEmptyTrimmedStringSchema.optional(),
    fallbackDisclosure: nonEmptyTrimmedStringSchema.optional(),
    failedImageSets: z.array(failedImageSetSchema).max(2).optional(),
    generationResultStates: generationResultStatesSchema.optional(),
    imageGenerationState: imageGenerationAttemptStateSchema.optional(),
    imageModelProvenance: imageModelProvenanceSchema.optional(),
    imageSets: z.array(imageSetSchema).max(2).optional(),
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5).optional(),
    phase: generationRunPhaseSchema.optional(),
    savedAt: z.string().datetime().optional(),
    selectedVisualJoke: selectedVisualJokeSchema.nullable().optional(),
    selectedImageOriginals: z.array(selectedImageOriginalSchema).max(2).optional(),
    sourceTweet: retrievedSourceTweetSchema.optional(),
    visualJokeDirection: visualJokeDirectionTextSchema.optional(),
    visualJokeSet: visualJokeSetSchema.optional(),
  })
  .strict()
  .superRefine((run, ctx) => {
    if (run.draftCount !== run.drafts.length) {
      ctx.addIssue({
        code: "custom",
        message: "Saved run draftCount must match the stored draft count.",
        path: ["draftCount"],
      });
    }

    if (run.status === "completed") {
      addCompletedRunOutputIssues({
        ctx,
        draftsLength: run.drafts.length,
        generationResultStates: run.generationResultStates,
      });
    }

    addSelectedVisualJokeIssues(run, ctx);
  });

export type CompletedGenerationRunPayload = z.infer<typeof completedGenerationRunPayloadSchema>;
export type SavedGenerationRun = z.infer<typeof savedGenerationRunSchema>;

export function parseCompletedGenerationRunPayload(
  payload: unknown,
): CompletedGenerationRunPayload {
  return completedGenerationRunPayloadSchema.parse(payload);
}

export function parseSavedGenerationRun(run: unknown): SavedGenerationRun {
  return savedGenerationRunSchema.parse(run);
}
