import { z } from "zod";
import { retrievedSourceTweetSchema } from "@/services/tweet-retrieval";
import {
  failedImageSetSchema,
  imageGenerationAttemptStateSchema,
  imageModelProvenanceSchema,
  imageSetSchema,
  selectedGeneratedImageSchema,
  selectedImageOriginalSchema,
} from "./image-generation";
import {
  imageOriginalCandidateSchema,
  imageOriginalCandidateTarget,
} from "./image-original-candidate";
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

function addSelectedDraftIssues(
  run: {
    selectedDraftId?: string;
    drafts: z.infer<typeof quoteTweetDraftSchema>[];
  },
  ctx: z.RefinementCtx,
) {
  if (!run.selectedDraftId) {
    return;
  }

  if (!run.drafts.some((draft) => draft.id === run.selectedDraftId)) {
    ctx.addIssue({
      code: "custom",
      message: "Selected Draft must belong to the run's drafts.",
      path: ["selectedDraftId"],
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
    imageOriginalCandidates: z
      .array(imageOriginalCandidateSchema)
      .max(imageOriginalCandidateTarget)
      .optional(),
    imageSet: imageSetSchema.optional(),
    failedImageSet: failedImageSetSchema.optional(),
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5).optional(),
    phase: generationRunPhaseSchema.optional(),
    selectedVisualJoke: selectedVisualJokeSchema.nullable().optional(),
    selectedGeneratedImage: selectedGeneratedImageSchema.nullable().optional(),
    selectedImageOriginal: selectedImageOriginalSchema.optional(),
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

const runOriginSchema = z.enum(["manual", "automated"]);

// Which image prompt fed image generation. Manual runs steer with the operator's
// User Image Prompt ("user"); automated runs have no operator, so they fall back
// to the system-owned Default Image Prompt ("default"). Absent on runs that
// predate the field.
const imagePromptSourceSchema = z.enum(["user", "default"]);

const savedGenerationRunSchema = z
  .object({
    id: runLocalIdSchema,
    jokeContextSnapshot: jokeContextSnapshotSchema.optional(),
    label: nonEmptyTrimmedStringSchema,
    // The run's provenance. Manual runs (and every run that predates server-side
    // persistence) default to "manual"; automated discovery runs land later.
    origin: runOriginSchema.optional(),
    // Whether image generation used the operator's User Image Prompt or the
    // system-owned Default Image Prompt. Automated runs always carry "default".
    imagePromptSource: imagePromptSourceSchema.optional(),
    // The News Coverage Cluster this run was started from, if any. Set on
    // automated runs so a cluster links to the single run it produced; absent on
    // manual runs and runs that predate automated discovery.
    newsCoverageClusterId: nonEmptyTrimmedStringSchema.optional(),
    seenAt: z.string().datetime().optional(),
    sourceTweetUrl: z.string().url(),
    usersDirection: z.string(),
    status: z.enum(["running", "completed", "failed"]),
    draftCount: z.number().int().nonnegative(),
    draftTarget: z.literal(draftTarget),
    drafts: z.array(quoteTweetDraftSchema).max(draftTarget),
    failureMessage: nonEmptyTrimmedStringSchema.optional(),
    fallbackDisclosure: nonEmptyTrimmedStringSchema.optional(),
    failedImageSet: failedImageSetSchema.optional(),
    generationResultStates: generationResultStatesSchema.optional(),
    imageGenerationState: imageGenerationAttemptStateSchema.optional(),
    imageModelProvenance: imageModelProvenanceSchema.optional(),
    imageOriginalCandidates: z
      .array(imageOriginalCandidateSchema)
      .max(imageOriginalCandidateTarget)
      .optional(),
    imageSet: imageSetSchema.optional(),
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5).optional(),
    phase: generationRunPhaseSchema.optional(),
    savedAt: z.string().datetime().optional(),
    // The operator's explicit, overridable pick of which draft is the chosen
    // quote tweet text. Distinct from the two Final Quote Tweet Image inputs
    // (Selected Generated Image + Selected Visual Joke); it never feeds the
    // composite. Absent until the operator picks one.
    selectedDraftId: nonEmptyTrimmedStringSchema.optional(),
    selectedVisualJoke: selectedVisualJokeSchema.nullable().optional(),
    selectedGeneratedImage: selectedGeneratedImageSchema.nullable().optional(),
    selectedImageOriginal: selectedImageOriginalSchema.optional(),
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
    addSelectedDraftIssues(run, ctx);
  });

export type CompletedGenerationRunPayload = z.infer<typeof completedGenerationRunPayloadSchema>;
export type SavedGenerationRun = z.infer<typeof savedGenerationRunSchema>;

export function parseCompletedGenerationRunPayload(
  payload: unknown,
): CompletedGenerationRunPayload {
  return completedGenerationRunPayloadSchema.parse(payload);
}

// Pre-categorized Visual Joke Sets (the ranked-eight shape) predate the
// categorized schema and fail its strict validation. Per the PRD there is no
// migration/backfill — only newly generated sets use the categorized shape — so
// a stored run carrying the old shape must still reopen rather than crash the
// runs list or the Active Run. We detect such a set and gate it out (leaving an
// empty Visual Joke area) while every other area of the run stays usable. A set
// already in the categorized shape passes through untouched, so freshly
// generated runs round-trip unchanged.
const legacyVisualJokeGatedMessage =
  "Legacy Visual Joke Set — generated before the categorized format and no longer displayable.";

function isCategorizedVisualJokeSet(value: unknown): boolean {
  return visualJokeSetSchema.safeParse(value).success;
}

function hasCompletedCreativeAreaBesidesVisualJokes(states: Record<string, unknown>): boolean {
  const textGeneration = states.textGeneration as { status?: unknown } | undefined;
  const newsLinkedImageDiscovery = states.newsLinkedImageDiscovery as
    | { status?: unknown }
    | undefined;

  return textGeneration?.status === "completed" || newsLinkedImageDiscovery?.status === "completed";
}

function gateLegacyVisualJokeSet(run: unknown): unknown {
  if (!run || typeof run !== "object") {
    return run;
  }

  const candidate: Record<string, unknown> = { ...(run as Record<string, unknown>) };

  // Top-level set: drop a legacy (or otherwise unparseable) set and the Selected
  // Visual Joke that can only reference a joke inside it.
  if (
    candidate.visualJokeSet !== undefined &&
    !isCategorizedVisualJokeSet(candidate.visualJokeSet)
  ) {
    delete candidate.visualJokeSet;
    delete candidate.selectedVisualJoke;
  }

  // Nested result-state set: a completed Visual Joke Generation stage that
  // carries a legacy set is downgraded so the strict stage schema doesn't throw.
  const states = candidate.generationResultStates;

  if (states && typeof states === "object") {
    const stagedStates = states as Record<string, unknown>;
    const visualJokeGeneration = stagedStates.visualJokeGeneration as
      | { status?: unknown; visualJokeSet?: unknown }
      | undefined;

    if (
      visualJokeGeneration?.status === "completed" &&
      !isCategorizedVisualJokeSet(visualJokeGeneration.visualJokeSet)
    ) {
      const gatedStates: Record<string, unknown> = {
        ...stagedStates,
        visualJokeGeneration: { status: "not-started" },
      };
      candidate.generationResultStates = gatedStates;

      // If the legacy Visual Jokes were the run's only completed creative area, a
      // "completed" run would now fail the "needs one successful creative result
      // area" invariant. Reopen it as a failed run instead of throwing.
      if (
        candidate.status === "completed" &&
        !hasCompletedCreativeAreaBesidesVisualJokes(gatedStates)
      ) {
        candidate.status = "failed";
        candidate.phase = "failed";
        candidate.failureMessage = candidate.failureMessage ?? legacyVisualJokeGatedMessage;
      }
    }
  }

  return candidate;
}

export function parseSavedGenerationRun(run: unknown): SavedGenerationRun {
  return savedGenerationRunSchema.parse(gateLegacyVisualJokeSet(run));
}
