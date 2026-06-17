import { z } from "zod";
import { nonEmptyTrimmedStringSchema, runLocalIdSchema } from "./schema-primitives";

export const visualJokeDirectionTextSchema = nonEmptyTrimmedStringSchema;

// The three Visual Joke Sections, in direction order. A Visual Joke belongs to
// exactly one; the UI groups the flat `jokes` array by this at render time.
export const visualJokeSections = ["satire", "tech-positive", "experimental"] as const;
export const visualJokeSectionSchema = z.enum(visualJokeSections);
export type VisualJokeSection = (typeof visualJokeSections)[number];

// The Direction targets seven jokes per section (up to twenty-one total). The set
// ships whatever survives per section; this is only the goal and the per-section
// cap the schema enforces.
export const targetPerSection = 7;

const visualJokeSchema = z
  .object({
    id: runLocalIdSchema,
    // The joke's contiguous position within its own section, starting at 1.
    order: z.number().int().positive(),
    section: visualJokeSectionSchema,
    text: nonEmptyTrimmedStringSchema,
  })
  .strict();

// A Top Pick is one of the model's self-flagged strongest jokes. It points at a
// joke by id and carries an internal one-line reason that the main surface never
// renders (no Visible Rationale) — retained for inspection only.
const visualJokeTopPickSchema = z
  .object({
    reason: nonEmptyTrimmedStringSchema,
    visualJokeId: runLocalIdSchema,
  })
  .strict();

export const visualJokeSetSchema = z
  .object({
    generatedAt: z.string().datetime(),
    id: runLocalIdSchema,
    // A single flat array (the UI groups by section) so id-based selection and
    // saved-run membership checks stay trivial. A publishable set can be as small
    // as one joke: we would rather ship the few that return than fail the whole
    // area. The cap is three full sections.
    jokes: z
      .array(visualJokeSchema)
      .min(1)
      .max(targetPerSection * 3),
    // The target seven-per-section goal; also the per-section cap below.
    targetPerSection: z.number().int().positive().default(targetPerSection),
    // The model's ordered Top Picks (1–3). The first is Automated Selection's
    // default; the service guarantees at least one exists.
    topPicks: z.array(visualJokeTopPickSchema).min(1).max(3),
  })
  .strict()
  .superRefine((visualJokeSet, ctx) => {
    const ids = new Set<string>();
    const orderBySection = new Map<VisualJokeSection, number>();

    visualJokeSet.jokes.forEach((joke, index) => {
      if (ids.has(joke.id)) {
        ctx.addIssue({
          code: "custom",
          message: "Visual Joke IDs must be unique within a Visual Joke Set.",
          path: ["jokes", index, "id"],
        });
      }

      ids.add(joke.id);

      // Within each section, order must be contiguous from 1 in the array order —
      // this rejects gaps, duplicates, and out-of-order positions in one check.
      const expectedOrder = (orderBySection.get(joke.section) ?? 0) + 1;
      orderBySection.set(joke.section, expectedOrder);

      if (joke.order !== expectedOrder) {
        ctx.addIssue({
          code: "custom",
          message: "Visual Joke order must be contiguous from 1 within each section.",
          path: ["jokes", index, "order"],
        });
      }
    });

    for (const count of orderBySection.values()) {
      if (count > visualJokeSet.targetPerSection) {
        ctx.addIssue({
          code: "custom",
          message: `A Visual Joke Section cannot exceed ${visualJokeSet.targetPerSection} jokes.`,
          path: ["jokes"],
        });
        break;
      }
    }

    const referencedJokeIds = new Set<string>();

    visualJokeSet.topPicks.forEach((topPick, index) => {
      if (!ids.has(topPick.visualJokeId)) {
        ctx.addIssue({
          code: "custom",
          message: "Each Top Pick must reference a Visual Joke in the set.",
          path: ["topPicks", index, "visualJokeId"],
        });
      }

      if (referencedJokeIds.has(topPick.visualJokeId)) {
        ctx.addIssue({
          code: "custom",
          message: "Top Picks must reference distinct Visual Jokes.",
          path: ["topPicks", index, "visualJokeId"],
        });
      }

      referencedJokeIds.add(topPick.visualJokeId);
    });
  });

export const selectedVisualJokeSchema = z
  .object({
    selectedAt: z.string().datetime(),
    visualJokeId: runLocalIdSchema,
  })
  .strict();

export type SelectedVisualJoke = z.infer<typeof selectedVisualJokeSchema> | null;
export type VisualJoke = z.infer<typeof visualJokeSchema>;
export type VisualJokeTopPick = z.infer<typeof visualJokeTopPickSchema>;
export type VisualJokeSet = z.infer<typeof visualJokeSetSchema>;

export function parseVisualJokeDirectionText(direction: unknown): string {
  return visualJokeDirectionTextSchema.parse(direction);
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
