import { z } from "zod";
import { nonEmptyTrimmedStringSchema, runLocalIdSchema } from "./schema-primitives";

export const visualJokeDirectionTextSchema = nonEmptyTrimmedStringSchema;

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

export const visualJokeSetSchema = z
  .object({
    generatedAt: z.string().datetime(),
    id: runLocalIdSchema,
    // A publishable set can be as small as one joke: we would rather ship the
    // few that survive the critic than fail the whole area (see the Visual Joke
    // shortfall notice on the result surface). `targetCount` still records the
    // goal (8), and the superRefine below keeps it >= the returned count.
    jokes: z.array(visualJokeSchema).min(1).max(8),
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

export const selectedVisualJokeSchema = z
  .object({
    selectedAt: z.string().datetime(),
    visualJokeId: runLocalIdSchema,
  })
  .strict();

export type SelectedVisualJoke = z.infer<typeof selectedVisualJokeSchema> | null;
export type VisualJoke = z.infer<typeof visualJokeSchema>;
export type VisualJokeMetadata = z.infer<typeof visualJokeMetadataSchema>;
export type VisualJokeSet = z.infer<typeof visualJokeSetSchema>;

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
