import { z } from "zod";
import type {
  OutsideXEnrichmentContext,
  ReplySignal,
} from "@/features/enrichment/outside-x-enrichment";
import { retrievedSourceTweetSchema } from "@/features/tweet-retrieval/tweet-retrieval";

export const draftTarget = 3;

const quoteTweetDraftSchema = z.object({
  id: z.string().min(1),
  text: z.string().min(1),
  modelProvenance: z.string().min(1),
});

const completedGenerationRunPayloadSchema = z
  .object({
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
      id: "draft-openai",
      text: `Quote-tweet draft: The real story is not the launch, it is the leverage. This update turns one product move into a pressure test for every platform trying to own the next interface.${contextClause}`,
      modelProvenance: "OpenAI stub model",
    },
    {
      id: "draft-anthropic",
      text: `Quote-tweet draft: Useful tech news usually hides in the incentives. If this works, the winner is not just the team shipping faster, but the company that makes everyone else adapt around it.${contextClause}`,
      modelProvenance: "Anthropic stub model",
    },
    {
      id: "draft-google",
      text: `Quote-tweet draft: This looks like a feature, but it behaves like a distribution bet. Watch who gets access first, who gets priced out, and who suddenly has to explain their roadmap.${contextClause}`,
      modelProvenance: "Google stub model",
    },
  ];

  const progressEvents = drafts.map((draft, index) =>
    generationStreamEventSchema.parse({
      type: "progress",
      label: runLabel,
      sourceTweet,
      draft,
      draftCount: index + 1,
      draftTarget,
    }),
  );

  return [
    ...progressEvents,
    generationStreamEventSchema.parse({
      type: "completed",
      run: {
        label: runLabel,
        sourceTweet,
        drafts,
      },
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
