import { z } from "zod";
import { retrievedSourceTweetSchema } from "@/services/tweet-retrieval";
import {
  completedGenerationRunPayloadSchema,
  parseCompletedGenerationRunPayload,
} from "./generation-run";
import {
  failedImageSetSchema,
  imageGenerationTerminalStateSchema,
  imageSetSchema,
} from "./image-generation";
import type { NewsLinkedImage } from "./news-linked-image";
import { newsLinkedImageSchema } from "./news-linked-image";
import { draftTarget } from "./providers";
import { quoteTweetDraftSchema } from "./quote-tweet-draft";
import { type GenerationResultStates, generationResultStatesSchema } from "./result-states";
import { nonEmptyTrimmedStringSchema } from "./schema-primitives";

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

export const generationStreamEventSchema = z.discriminatedUnion("type", [
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

export type GenerationStreamEvent = z.infer<typeof generationStreamEventSchema>;
export type ImageGenerationStreamEvent = z.infer<typeof imageGenerationStreamEventSchema>;

type CompletedGenerationRunEventsInput = {
  run: z.infer<typeof completedGenerationRunPayloadSchema>;
};

export function parseGenerationStreamEvent(event: unknown): GenerationStreamEvent {
  return generationStreamEventSchema.parse(event);
}

export function parseImageGenerationStreamEvent(event: unknown): ImageGenerationStreamEvent {
  return imageGenerationStreamEventSchema.parse(event);
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
