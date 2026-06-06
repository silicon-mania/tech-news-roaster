import { z } from "zod";
import type {
  OutsideXEnrichmentContext,
  ReplySignal,
} from "@/features/enrichment/outside-x-enrichment";
import { retrievedSourceTweetSchema } from "@/features/tweet-retrieval/tweet-retrieval";

export const draftTarget = 3;

export const generationProviderIds = ["openai", "anthropic", "google"] as const;

export type GenerationProviderId = (typeof generationProviderIds)[number];

const generationProviderIdSchema = z.enum(generationProviderIds);

const quoteTweetDraftSchema = z.object({
  id: z.string().min(1),
  angle: z.string().min(1),
  fallbackForProvider: generationProviderIdSchema.optional(),
  text: z.string().min(1),
  modelProvenance: z.string().min(1),
  provider: generationProviderIdSchema,
  visibleRationale: z.string().min(1),
});

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
  generationProgressEventSchema,
  generationCompletedEventSchema,
  generationFailedEventSchema,
]);

export type QuoteTweetDraft = z.infer<typeof quoteTweetDraftSchema>;
export type CompletedGenerationRunPayload = z.infer<
  typeof completedGenerationRunPayloadSchema
>;
export type GenerationStreamEvent = z.infer<typeof generationStreamEventSchema>;

type StubbedGenerationInput = {
  sourceTweetUrl: string;
  sourceTweet: z.infer<typeof retrievedSourceTweetSchema>;
  replySignals: ReplySignal[];
  enrichmentContext?: OutsideXEnrichmentContext;
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

export function parseCompletedGenerationRunPayload(
  payload: unknown,
): CompletedGenerationRunPayload {
  return completedGenerationRunPayloadSchema.parse(payload);
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
