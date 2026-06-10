import { z } from "zod";
import { retrievedSourceTweetSchema, sourceTweetMediaKindSchema } from "@/services/tweet-retrieval";

export const draftTarget = 3;

export const generationProviderIds = ["openai", "anthropic", "google"] as const;

export type GenerationProviderId = (typeof generationProviderIds)[number];

const generationProviderIdSchema = z.enum(generationProviderIds);
const nonEmptyTrimmedStringSchema = z.string().trim().min(1);

const runLocalIdSchema = z
  .string()
  .min(1)
  .refine((value) => !/^https?:\/\//i.test(value), {
    message: "Expected a run-local ID, not a raw URL.",
  });

export const newsLinkedImageSchema = z
  .object({
    id: runLocalIdSchema,
    url: z.string().url(),
    altText: nonEmptyTrimmedStringSchema.optional(),
    sourceUrl: z.string().url().optional(),
    title: nonEmptyTrimmedStringSchema.optional(),
  })
  .strict();

const selectedImageOriginalSchema = z
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

const imageModelProvenanceSchema = z
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

const imageSetSchema = z
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

const failedImageSetSchema = z
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

const imageGenerationTerminalStateSchema = z
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

const imageGenerationAttemptStateSchema = z.discriminatedUnion("status", [
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

export const sourceTweetMediaExtractionSchema = z
  .object({
    summary: nonEmptyTrimmedStringSchema,
    visibleText: z.array(nonEmptyTrimmedStringSchema),
    notableDetails: z.array(nonEmptyTrimmedStringSchema),
    mediaKinds: z.array(sourceTweetMediaKindSchema).min(1),
  })
  .strict();

const authorContextSchema = z
  .object({
    authoritySignals: z.array(nonEmptyTrimmedStringSchema),
    displayName: nonEmptyTrimmedStringSchema,
    handle: nonEmptyTrimmedStringSchema,
    relationshipToTopic: nonEmptyTrimmedStringSchema,
    role: nonEmptyTrimmedStringSchema.optional(),
  })
  .strict();

const representativeReplySignalSchema = z
  .object({
    authorHandle: nonEmptyTrimmedStringSchema.optional(),
    replyId: runLocalIdSchema.optional(),
    signal: nonEmptyTrimmedStringSchema,
    snippet: nonEmptyTrimmedStringSchema,
  })
  .strict();

const jokeContextQualitySchema = z
  .object({
    status: z.enum(["strong", "usable", "thin"]),
    summary: nonEmptyTrimmedStringSchema,
  })
  .strict();

const structuredJokeContextSchema = z
  .object({
    authorContext: authorContextSchema,
    forbiddenAssumptions: z.array(nonEmptyTrimmedStringSchema),
    jokeContextQuality: jokeContextQualitySchema,
    jokeableTensions: z.array(nonEmptyTrimmedStringSchema).min(1),
    replySignals: z
      .object({
        representativeSnippets: z.array(representativeReplySignalSchema).max(5),
        summary: nonEmptyTrimmedStringSchema,
      })
      .strict(),
    sourceTweetClaim: nonEmptyTrimmedStringSchema,
    sourceTweetMediaExtraction: sourceTweetMediaExtractionSchema,
    supportingFacts: z.array(nonEmptyTrimmedStringSchema),
    unknowns: z.array(nonEmptyTrimmedStringSchema),
  })
  .strict();

const jokeContextSnapshotSchema = z
  .object({
    capturedAt: z.string().datetime(),
    sourceTweetId: nonEmptyTrimmedStringSchema,
    structuredContext: structuredJokeContextSchema,
  })
  .strict();

const visualJokeDirectionTextSchema = nonEmptyTrimmedStringSchema;

const visualJokeMetadataSchema = z
  .object({
    jokePattern: nonEmptyTrimmedStringSchema,
    jokeTarget: nonEmptyTrimmedStringSchema,
    referencedFact: nonEmptyTrimmedStringSchema,
    shortRationale: nonEmptyTrimmedStringSchema,
  })
  .strict();

const visualJokeSchema = z
  .object({
    id: runLocalIdSchema,
    metadata: visualJokeMetadataSchema,
    rank: z.number().int().positive(),
    recommended: z.boolean().default(false),
    text: nonEmptyTrimmedStringSchema,
  })
  .strict();

const visualJokeSetSchema = z
  .object({
    generatedAt: z.string().datetime(),
    id: runLocalIdSchema,
    jokes: z.array(visualJokeSchema).min(5).max(8),
    targetCount: z.number().int().min(5).max(8).default(8),
  })
  .strict()
  .superRefine((visualJokeSet, ctx) => {
    const ids = new Set<string>();

    visualJokeSet.jokes.forEach((joke, index) => {
      if (ids.has(joke.id)) {
        ctx.addIssue({
          code: "custom",
          message: "Visual Joke IDs must be unique within a Visual Joke Set.",
          path: ["jokes", index, "id"],
        });
      }

      ids.add(joke.id);

      if (joke.rank !== index + 1) {
        ctx.addIssue({
          code: "custom",
          message: "Visual Jokes must be ranked in order starting at 1.",
          path: ["jokes", index, "rank"],
        });
      }
    });

    if (!visualJokeSet.jokes[0]?.recommended) {
      ctx.addIssue({
        code: "custom",
        message: "The first Visual Joke must be the Recommended Visual Joke.",
        path: ["jokes", 0, "recommended"],
      });
    }

    if (visualJokeSet.jokes.slice(1).some((joke) => joke.recommended)) {
      ctx.addIssue({
        code: "custom",
        message: "Only the first Visual Joke can be marked recommended.",
        path: ["jokes"],
      });
    }

    if (visualJokeSet.targetCount < visualJokeSet.jokes.length) {
      ctx.addIssue({
        code: "custom",
        message: "Visual Joke target count cannot be smaller than the returned candidate count.",
        path: ["targetCount"],
      });
    }
  });

const selectedVisualJokeSchema = z
  .object({
    selectedAt: z.string().datetime(),
    visualJokeId: runLocalIdSchema,
  })
  .strict();

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

const visualJokeGenerationStateSchema = z.discriminatedUnion("status", [
  resultStageNotStartedSchema,
  resultStageRunningSchema,
  z
    .object({
      completedAt: z.string().datetime(),
      startedAt: z.string().datetime(),
      status: z.literal("completed"),
      visualJokeSet: visualJokeSetSchema,
    })
    .strict(),
  resultStageFailedSchema,
]);

const generationResultStatesSchema = z
  .object({
    contextGathering: contextGatheringStateSchema,
    imageGeneration: imageGenerationAttemptStateSchema,
    newsLinkedImageDiscovery: newsLinkedImageDiscoveryStateSchema,
    textGeneration: textGenerationStateSchema,
    visualJokeGeneration: visualJokeGenerationStateSchema,
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

    if (states.visualJokeGeneration.status !== "not-started") {
      ctx.addIssue({
        code: "custom",
        message: "Visual Joke Generation cannot start before Joke Context Gathering completes.",
        path: ["visualJokeGeneration"],
      });
    }
  });

const generationRunPhaseSchema = z.enum([
  "enrichment-running",
  "text-generation-running",
  "waiting-for-image-selection",
  "image-generation-running",
  "image-generation-partially-failed",
  "image-generation-complete",
  "failed",
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

const quoteTweetDraftSchema = z
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

const completedGenerationRunPayloadSchema = z
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
  });

const generationRunStateEventSchema = z
  .object({
    type: z.literal("run-state"),
    label: nonEmptyTrimmedStringSchema,
    sourceTweet: retrievedSourceTweetSchema,
    generationResultStates: generationResultStatesSchema,
  })
  .strict();

const generationProgressEventSchema = z
  .object({
    type: z.literal("progress"),
    label: nonEmptyTrimmedStringSchema,
    sourceTweet: retrievedSourceTweetSchema,
    draft: quoteTweetDraftSchema,
    draftCount: z.number().int().min(1).max(draftTarget),
    draftTarget: z.literal(draftTarget),
  })
  .strict();

const enrichmentCompletedEventSchema = z
  .object({
    type: z.literal("enrichment-completed"),
    sourceTweet: retrievedSourceTweetSchema,
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5),
  })
  .strict();

const generationCompletedEventSchema = z
  .object({
    type: z.literal("completed"),
    run: completedGenerationRunPayloadSchema,
  })
  .strict();

const generationFailedEventSchema = z
  .object({
    type: z.literal("failed"),
    message: nonEmptyTrimmedStringSchema,
  })
  .strict();

const generationStreamEventSchema = z.discriminatedUnion("type", [
  enrichmentCompletedEventSchema,
  generationRunStateEventSchema,
  generationProgressEventSchema,
  generationCompletedEventSchema,
  generationFailedEventSchema,
]);

const imageSetCompletedEventSchema = z
  .object({
    type: z.literal("image-set-completed"),
    imageSet: imageSetSchema,
  })
  .strict();

const imageSetFailedEventSchema = z
  .object({
    type: z.literal("image-set-failed"),
    failedImageSet: failedImageSetSchema,
  })
  .strict();

const imageGenerationCompletedEventSchema = z
  .object({
    type: z.literal("image-generation-completed"),
    state: imageGenerationTerminalStateSchema,
  })
  .strict();

const imageGenerationStreamEventSchema = z.discriminatedUnion("type", [
  imageSetCompletedEventSchema,
  imageSetFailedEventSchema,
  imageGenerationCompletedEventSchema,
]);

export type NewsLinkedImage = z.infer<typeof newsLinkedImageSchema>;
export type FailedImageSet = z.infer<typeof failedImageSetSchema>;
export type ImageGenerationInput = z.infer<typeof imageGenerationInputSchema>;
export type ImageGenerationParentRun = z.infer<typeof imageGenerationParentRunSchema>;
export type ImageModelProvenance = z.infer<typeof imageModelProvenanceSchema>;
export type ImageSet = z.infer<typeof imageSetSchema>;
export type JokeContextSnapshot = z.infer<typeof jokeContextSnapshotSchema>;
export type GenerationResultStates = z.infer<typeof generationResultStatesSchema>;
export type QuoteTweetDraft = z.infer<typeof quoteTweetDraftSchema>;
export type SelectedImageOriginal = z.infer<typeof selectedImageOriginalSchema>;
export type SelectedVisualJoke = z.infer<typeof selectedVisualJokeSchema> | null;
export type SourceTweetMediaExtraction = z.infer<typeof sourceTweetMediaExtractionSchema>;
export type StructuredJokeContext = z.infer<typeof structuredJokeContextSchema>;
export type VisualJoke = z.infer<typeof visualJokeSchema>;
export type VisualJokeMetadata = z.infer<typeof visualJokeMetadataSchema>;
export type VisualJokeSet = z.infer<typeof visualJokeSetSchema>;
export type CompletedGenerationRunPayload = z.infer<typeof completedGenerationRunPayloadSchema>;
export type GenerationStreamEvent = z.infer<typeof generationStreamEventSchema>;
export type ImageGenerationStreamEvent = z.infer<typeof imageGenerationStreamEventSchema>;
export type SavedGenerationRun = z.infer<typeof savedGenerationRunSchema>;

type StubbedGenerationInput = {
  sourceTweetUrl: string;
  sourceTweet: z.infer<typeof retrievedSourceTweetSchema>;
  replySignals: unknown[];
  enrichmentContext?: {
    items: unknown[];
    newsLinkedImages: NewsLinkedImage[];
  };
  usersDirection: string;
};

type CompletedGenerationRunEventsInput = {
  run: CompletedGenerationRunPayload;
};

export function parseGenerationStreamEvent(event: unknown): GenerationStreamEvent {
  return generationStreamEventSchema.parse(event);
}

export function parseImageGenerationStreamEvent(event: unknown): ImageGenerationStreamEvent {
  return imageGenerationStreamEventSchema.parse(event);
}

export function parseImageGenerationInput(input: unknown): ImageGenerationInput {
  return imageGenerationInputSchema.parse(input);
}

export function parseImageGenerationParentRun(parentRun: unknown): ImageGenerationParentRun {
  return imageGenerationParentRunSchema.parse(parentRun);
}

export function parseStructuredJokeContext(input: unknown): StructuredJokeContext {
  return structuredJokeContextSchema.parse(input);
}

export function parseJokeContextSnapshot(snapshot: unknown): JokeContextSnapshot {
  return jokeContextSnapshotSchema.parse(snapshot);
}

export function parseSourceTweetMediaExtraction(input: unknown): SourceTweetMediaExtraction {
  return sourceTweetMediaExtractionSchema.parse(input);
}

export function parseVisualJokeDirectionText(direction: unknown): string {
  return visualJokeDirectionTextSchema.parse(direction);
}

export function parseVisualJokeMetadata(metadata: unknown): VisualJokeMetadata {
  return visualJokeMetadataSchema.parse(metadata);
}

export function parseVisualJoke(visualJoke: unknown): VisualJoke {
  return visualJokeSchema.parse(visualJoke);
}

export function parseVisualJokeSet(visualJokeSet: unknown): VisualJokeSet {
  return visualJokeSetSchema.parse(visualJokeSet);
}

export function parseSelectedVisualJoke(
  selectedVisualJoke: unknown,
  visualJokeSet?: VisualJokeSet,
): SelectedVisualJoke {
  return z
    .nullable(selectedVisualJokeSchema)
    .superRefine((selection, ctx) => {
      if (!selection || !visualJokeSet) {
        return;
      }

      if (!visualJokeSet.jokes.some((joke) => joke.id === selection.visualJokeId)) {
        ctx.addIssue({
          code: "custom",
          message: "Selected Visual Joke must belong to the provided Visual Joke Set.",
          path: ["visualJokeId"],
        });
      }
    })
    .parse(selectedVisualJoke);
}

export function parseGenerationResultStates(input: unknown): GenerationResultStates {
  return generationResultStatesSchema.parse(input);
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

export function parseCompletedGenerationRunPayload(
  payload: unknown,
): CompletedGenerationRunPayload {
  return completedGenerationRunPayloadSchema.parse(payload);
}

export function parseSavedGenerationRun(run: unknown): SavedGenerationRun {
  return savedGenerationRunSchema.parse(run);
}

export function buildEnrichmentCompletedEvent({
  newsLinkedImages,
  sourceTweet,
}: {
  newsLinkedImages: NewsLinkedImage[];
  sourceTweet: z.infer<typeof retrievedSourceTweetSchema>;
}): GenerationStreamEvent {
  return generationStreamEventSchema.parse({
    type: "enrichment-completed",
    sourceTweet,
    newsLinkedImages,
  });
}

export function buildGenerationRunStateEvent({
  generationResultStates,
  label,
  sourceTweet,
}: {
  generationResultStates: GenerationResultStates;
  label: string;
  sourceTweet: z.infer<typeof retrievedSourceTweetSchema>;
}): GenerationStreamEvent {
  return generationStreamEventSchema.parse({
    type: "run-state",
    label,
    sourceTweet,
    generationResultStates,
  });
}

export function buildStubbedGenerationEvents({
  enrichmentContext,
  replySignals,
  sourceTweet,
  sourceTweetUrl,
  usersDirection,
}: StubbedGenerationInput): GenerationStreamEvent[] {
  const runLabel = buildStubbedRunLabel(sourceTweetUrl);
  const directionClause = usersDirection
    ? ` It respects the user's direction: ${usersDirection}`
    : "";
  const replySignalClause =
    replySignals.length > 0
      ? " It also reads the reply signals without exposing them as a research panel."
      : "";
  const enrichmentClause =
    enrichmentContext && enrichmentContext.items.length > 0
      ? " It uses outside-X context only as hidden supporting material."
      : "";
  const contextClause = `${directionClause}${replySignalClause}${enrichmentClause}`;
  const drafts: QuoteTweetDraft[] = [
    {
      angle: "platform leverage",
      id: "draft-openai",
      text: `Quote-tweet draft: The real story is not the launch, it is the leverage. This update turns one product move into a pressure test for every platform trying to own the next interface.${contextClause}`,
      modelProvenance: "local draft model",
      provider: "openai",
      visibleRationale: "Frames the news around platform leverage and interface ownership.",
    },
    {
      angle: "incentive shift",
      id: "draft-anthropic",
      text: `Quote-tweet draft: Useful tech news usually hides in the incentives. If this works, the winner is not just the team shipping faster, but the company that makes everyone else adapt around it.${contextClause}`,
      modelProvenance: "local draft model",
      provider: "anthropic",
      visibleRationale:
        "Emphasizes incentives, adaptation pressure, and the strategic second-order effect.",
    },
    {
      angle: "distribution bet",
      id: "draft-google",
      text: `Quote-tweet draft: This looks like a feature, but it behaves like a distribution bet. Watch who gets access first, who gets priced out, and who suddenly has to explain their roadmap.${contextClause}`,
      modelProvenance: "local draft model",
      provider: "google",
      visibleRationale:
        "Treats the update as a distribution bet with pricing and access consequences.",
    },
  ];

  return buildCompletedGenerationRunEvents({
    run: {
      label: runLabel,
      sourceTweet,
      drafts,
      newsLinkedImages: enrichmentContext?.newsLinkedImages,
    },
  });
}

export function buildCompletedGenerationRunEvents({
  run,
}: CompletedGenerationRunEventsInput): GenerationStreamEvent[] {
  const validatedRun = parseCompletedGenerationRunPayload(run);
  const progressEvents = validatedRun.drafts.map((draft, index) =>
    generationStreamEventSchema.parse({
      type: "progress",
      label: validatedRun.label,
      sourceTweet: validatedRun.sourceTweet,
      draft,
      draftCount: index + 1,
      draftTarget,
    }),
  );

  return [
    ...progressEvents,
    generationStreamEventSchema.parse({
      type: "completed",
      run: validatedRun,
    }),
  ];
}

export function buildGenerationFailureEvent(message: string): GenerationStreamEvent {
  return generationStreamEventSchema.parse({
    type: "failed",
    message,
  });
}

function buildStubbedRunLabel(sourceTweetUrl: string) {
  const statusId = sourceTweetUrl.match(/status\/([^/?#]+)/)?.[1] ?? "tweet";

  return `Drafts for ${statusId}`;
}
