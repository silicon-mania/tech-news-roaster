import { z } from "zod";
import { retrievedSourceTweetSchema } from "@/services/tweet-retrieval";
import {
  failedImageSetSchema,
  imageGenerationAttemptStateSchema,
  imageModelProvenanceSchema,
  imageSetSchema,
  selectedGeneratedImageSchema,
  selectedImageOriginalSchema,
  uploadedImageSetEntrySchema,
} from "./image-generation";
import {
  imageOriginalCandidateSchema,
  imageOriginalCandidateTarget,
} from "./image-original-candidate";
import { jokeContextSnapshotSchema } from "./joke-context";
import { newsLinkedImageSchema } from "./news-linked-image";
import { draftTarget } from "./providers";
import { quoteTweetDraftSchema } from "./quote-tweet-draft";
import {
  type GenerationResultStates,
  generationResultStatesSchema,
  newsCategoryClassificationStateSchema,
} from "./result-states";
import { generationRunPhaseSchema } from "./run-phase";
import { nonEmptyTrimmedStringSchema, runLocalIdSchema } from "./schema-primitives";

function countSuccessfulCreativeResultAreas(states: GenerationResultStates) {
  let successCount = 0;

  if (states.textGeneration.status === "completed") {
    successCount += 1;
  }

  if (states.newsLinkedImageDiscovery.status === "completed") {
    successCount += 1;
  }

  return successCount;
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
    // The News Category stamp the classifier picked during the manual run stream
    // (ADR-0027 / issue 004), carried through to the run autosaved on completion.
    // Resolves to VIRAL on read when absent.
    newsCategory: nonEmptyTrimmedStringSchema.optional(),
    // The classifier's terminal result-state. A failed classification still
    // resolves VIRAL and never fails the run, so this rides the payload alongside
    // — never inside — the success-counted generationResultStates.
    newsCategoryClassification: newsCategoryClassificationStateSchema.optional(),
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
    selectedGeneratedImage: selectedGeneratedImageSchema.nullable().optional(),
    selectedImageOriginal: selectedImageOriginalSchema.optional(),
  })
  .strict()
  .superRefine((run, ctx) => {
    addCompletedRunOutputIssues({
      ctx,
      draftsLength: run.drafts.length,
      generationResultStates: run.generationResultStates,
    });
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
    // The current News Category stamp on the Final Quote Tweet Image (ADR-0027):
    // a single flat value — the classifier's pick, an operator override, or a
    // free custom word. One of the ten lights its chip; any other string is a
    // custom stamp. Absent on pre-feature runs; read-time consumers resolve it as
    // `newsCategory ?? "VIRAL"`. Rides the JSONB payload — no column, no migration.
    newsCategory: nonEmptyTrimmedStringSchema.optional(),
    // The News Category classifier's terminal result-state, persisted so a
    // failure surfaces (ghost icon + Quiet Failure Details) on reopen — including
    // on automated runs the operator never watched. It is NOT a Creative Result
    // Area: a failed classification still renders VIRAL and never affects the
    // Successful Run / Complete Run determination.
    newsCategoryClassification: newsCategoryClassificationStateSchema.optional(),
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
    // The run's ordered stack of operator-uploaded image sets (ADR-0025), each a
    // completed set or a retained failure. Additive over the single source-derived
    // `imageSet`; absent on runs that predate the feature, so it defaults to an
    // empty list with no migration.
    uploadedImageSets: z.array(uploadedImageSetEntrySchema).default([]),
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5).optional(),
    phase: generationRunPhaseSchema.optional(),
    savedAt: z.string().datetime().optional(),
    // The operator's explicit, overridable pick of which draft is the chosen
    // quote tweet text. Distinct from the Final Quote Tweet Image input (the
    // Selected Generated Image); it never feeds the composite. Absent until the
    // operator picks one.
    selectedDraftId: nonEmptyTrimmedStringSchema.optional(),
    selectedGeneratedImage: selectedGeneratedImageSchema.nullable().optional(),
    selectedImageOriginal: selectedImageOriginalSchema.optional(),
    sourceTweet: retrievedSourceTweetSchema.optional(),
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

    addSelectedDraftIssues(run, ctx);
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
