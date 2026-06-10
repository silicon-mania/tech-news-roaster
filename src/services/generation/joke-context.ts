import { z } from "zod";
import { sourceTweetMediaKindSchema } from "@/services/tweet-retrieval";
import { nonEmptyTrimmedStringSchema, runLocalIdSchema } from "./schema-primitives";

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

export const jokeContextSnapshotSchema = z
  .object({
    capturedAt: z.string().datetime(),
    sourceTweetId: nonEmptyTrimmedStringSchema,
    structuredContext: structuredJokeContextSchema,
  })
  .strict();

export type JokeContextSnapshot = z.infer<typeof jokeContextSnapshotSchema>;
export type SourceTweetMediaExtraction = z.infer<typeof sourceTweetMediaExtractionSchema>;
export type StructuredJokeContext = z.infer<typeof structuredJokeContextSchema>;

export function parseStructuredJokeContext(input: unknown): StructuredJokeContext {
  return structuredJokeContextSchema.parse(input);
}

export function parseJokeContextSnapshot(snapshot: unknown): JokeContextSnapshot {
  return jokeContextSnapshotSchema.parse(snapshot);
}

export function parseSourceTweetMediaExtraction(input: unknown): SourceTweetMediaExtraction {
  return sourceTweetMediaExtractionSchema.parse(input);
}
