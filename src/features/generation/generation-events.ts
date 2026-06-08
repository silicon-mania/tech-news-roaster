import { z } from "zod";
import { retrievedSourceTweetSchema } from "@/features/tweet-retrieval/tweet-retrieval";

export const draftTarget = 3;

export const generationProviderIds = ["openai", "anthropic", "google"] as const;

export type GenerationProviderId = (typeof generationProviderIds)[number];

const generationProviderIdSchema = z.enum(generationProviderIds);

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
    altText: z.string().min(1).optional(),
    sourceUrl: z.string().url().optional(),
    title: z.string().min(1).optional(),
  })
  .strict();

const selectedImageOriginalSchema = z
  .object({
    id: runLocalIdSchema,
    newsLinkedImageId: runLocalIdSchema,
    url: z.string().url(),
    altText: z.string().min(1).optional(),
    preparedAt: z.string().datetime(),
    sourceUrl: z.string().url().optional(),
    title: z.string().min(1).optional(),
  })
  .strict();

const imageModelProvenanceSchema = z
  .object({
    model: z.string().min(1),
    provider: z.string().min(1).optional(),
  })
  .strict();

const imageOptionKindSchema = z.enum(["original", "variation"]);

const imageOptionSchema = z
  .object({
    id: runLocalIdSchema,
    altText: z.string().min(1).optional(),
    kind: imageOptionKindSchema,
    label: z.string().min(1),
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
      imageSet.options[1].label === "Variation 1" &&
      imageSet.options[2].label === "Variation 2",
    {
      message:
        "Image Sets must contain Original, Variation 1, and Variation 2.",
      path: ["options"],
    },
  );

const failedImageSetSchema = z
  .object({
    id: runLocalIdSchema,
    failedAt: z.string().datetime(),
    message: z.string().min(1),
    selectedImageId: runLocalIdSchema,
    selectedImageOriginal: selectedImageOriginalSchema.optional(),
  })
  .strict();

const selectedImageIdsSchema = z.array(runLocalIdSchema).min(1).max(2);

const imageGenerationInputSchema = z
  .object({
    parentRunId: runLocalIdSchema,
    selectedImageIds: selectedImageIdsSchema,
    userImagePrompt: z.string().trim().min(1),
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
    userImagePrompt: z.string().trim().min(1),
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

const generationRunPhaseSchema = z.enum([
  "enrichment-running",
  "text-generation-running",
  "waiting-for-image-selection",
  "image-generation-running",
  "image-generation-partially-failed",
  "image-generation-complete",
  "failed",
]);

const quoteTweetDraftSchema = z
  .object({
    id: z.string().min(1),
    angle: z.string().min(1),
    fallbackForProvider: generationProviderIdSchema.optional(),
    text: z.string().min(1),
    modelProvenance: z.string().min(1),
    provider: generationProviderIdSchema,
    visibleRationale: z.string().min(1),
  })
  .strict();

const completedGenerationRunPayloadSchema = z
  .object({
    fallbackDisclosure: z.string().min(1).optional(),
    label: z.string().min(1),
    sourceTweet: retrievedSourceTweetSchema,
    drafts: z
      .array(quoteTweetDraftSchema)
      .length(
        draftTarget,
        "A completed Generation Run must have three drafts.",
      ),
    imageGenerationState: imageGenerationAttemptStateSchema.optional(),
    imageModelProvenance: imageModelProvenanceSchema.optional(),
    imageSets: z.array(imageSetSchema).max(2).optional(),
    failedImageSets: z.array(failedImageSetSchema).max(2).optional(),
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5).optional(),
    phase: generationRunPhaseSchema.optional(),
    selectedImageOriginals: z
      .array(selectedImageOriginalSchema)
      .max(2)
      .optional(),
  })
  .strict();

const savedGenerationRunSchema = z
  .object({
    id: runLocalIdSchema,
    label: z.string().min(1),
    sourceTweetUrl: z.string().url(),
    usersDirection: z.string(),
    status: z.enum(["running", "completed", "failed"]),
    draftCount: z.number().int().nonnegative(),
    draftTarget: z.literal(draftTarget),
    drafts: z.array(quoteTweetDraftSchema).max(draftTarget),
    failureMessage: z.string().min(1).optional(),
    fallbackDisclosure: z.string().min(1).optional(),
    failedImageSets: z.array(failedImageSetSchema).max(2).optional(),
    imageGenerationState: imageGenerationAttemptStateSchema.optional(),
    imageModelProvenance: imageModelProvenanceSchema.optional(),
    imageSets: z.array(imageSetSchema).max(2).optional(),
    newsLinkedImages: z.array(newsLinkedImageSchema).min(1).max(5).optional(),
    phase: generationRunPhaseSchema.optional(),
    savedAt: z.string().datetime().optional(),
    selectedImageOriginals: z
      .array(selectedImageOriginalSchema)
      .max(2)
      .optional(),
    sourceTweet: retrievedSourceTweetSchema.optional(),
  })
  .strict();

const generationProgressEventSchema = z
  .object({
    type: z.literal("progress"),
    label: z.string().min(1),
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
    message: z.string().min(1),
  })
  .strict();

const generationStreamEventSchema = z.discriminatedUnion("type", [
  enrichmentCompletedEventSchema,
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
export type ImageGenerationInput = z.infer<typeof imageGenerationInputSchema>;
export type QuoteTweetDraft = z.infer<typeof quoteTweetDraftSchema>;
export type CompletedGenerationRunPayload = z.infer<
  typeof completedGenerationRunPayloadSchema
>;
export type GenerationStreamEvent = z.infer<typeof generationStreamEventSchema>;
export type ImageGenerationStreamEvent = z.infer<
  typeof imageGenerationStreamEventSchema
>;
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

export function parseGenerationStreamEvent(
  event: unknown,
): GenerationStreamEvent {
  return generationStreamEventSchema.parse(event);
}

export function parseImageGenerationStreamEvent(
  event: unknown,
): ImageGenerationStreamEvent {
  return imageGenerationStreamEventSchema.parse(event);
}

export function parseImageGenerationInput(
  input: unknown,
): ImageGenerationInput {
  return imageGenerationInputSchema.parse(input);
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
      visibleRationale:
        "Frames the news around platform leverage and interface ownership.",
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

export function buildGenerationFailureEvent(
  message: string,
): GenerationStreamEvent {
  return generationStreamEventSchema.parse({
    type: "failed",
    message,
  });
}

function buildStubbedRunLabel(sourceTweetUrl: string) {
  const statusId = sourceTweetUrl.match(/status\/([^/?#]+)/)?.[1] ?? "tweet";

  return `Drafts for ${statusId}`;
}
