import { nonEmptyTrimmedStringSchema } from "./schema-primitives";

/**
 * The Default Image Prompt (CONTEXT.md): the system-owned image prompt an
 * Automated Run uses in place of the operator's User Image Prompt, since an
 * automated run has no operator to write one. It steers the four image
 * variations toward Silicon Mania's editorial look while preserving the selected
 * image original's core subject — the same contract a manual User Image Prompt
 * fills, just system-supplied.
 *
 * This is a documented *default*: it ships as working wording so automated runs
 * can generate images today. The final, tuned wording is deferred to issue 021
 * (schedule sweep / config / real smoke), where it is validated against real
 * image-model output. Keep it a single source of truth — automated composition
 * reads this constant rather than inlining prompt text.
 *
 * It satisfies the same constraint as a User Image Prompt (a non-empty trimmed
 * string), so it can flow through Image Generation unchanged.
 */
export const defaultImagePrompt = nonEmptyTrimmedStringSchema.parse(
  [
    "Reinterpret the attached image as a bold, editorial tech-news visual in the",
    "Silicon Mania style: clean, high-contrast, and graphic, with a dry satirical",
    "edge that reads instantly at scroll speed.",
    "Preserve the core subject and any recognizable product, person, or brand from",
    "the original so the picture still reads as being about this news.",
    "Favor strong composition and lighting over clutter; avoid added captions,",
    "watermarks, logos, or text overlays — the joke title is composited separately.",
  ].join(" "),
);
