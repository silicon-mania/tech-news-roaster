import { nonEmptyTrimmedStringSchema } from "./schema-primitives";

/**
 * The Default Image Prompt (CONTEXT.md): the single source of truth for the
 * image-generation House Style. It plays two roles:
 *
 * - **Manual runs:** it seeds the operator's editable User Image Prompt field so
 *   a real person can tweak it before starting generation, then it locks once a
 *   run begins (the operator can read but not change it afterward).
 * - **Automated Runs:** it is sent verbatim in place of an operator-authored
 *   prompt, since a headless run has no operator to write one.
 *
 * Both paths feed the same constant into Image Generation, so the look stays
 * consistent whether a human or the scheduler kicked the run off.
 *
 * It satisfies the same constraint as a User Image Prompt (a non-empty trimmed
 * string), so it can flow through Image Generation unchanged. The multi-line
 * layout below is the literal prompt wording — keep it formatted as written so
 * the operator sees a readable, editable prompt rather than one collapsed line.
 */
export const defaultImagePrompt = nonEmptyTrimmedStringSchema.parse(`
Transform this image into the iconic, highly detailed art style of the adult animated series 'Rick and Morty'.

STRICT FIDELITY RULES — follow these above all else:
The output MUST be a near-perfect recreation of the input image. Study every pixel of the original before generating.
Preserve the EXACT composition, framing, layout, and camera angle. Do not crop, zoom, reframe, or shift perspective.
Every person, character, and object visible in the input MUST appear in the output in the SAME position, at the SAME scale, with the SAME pose and gesture.
FACES ARE CRITICAL: Reproduce each person's exact face shape, jawline, chin, nose bridge width, nostril shape, lip thickness, eye spacing, brow arch, forehead size. The face must be instantly recognizable as the same person. Preserve each person's distinguishing features with maximum accuracy: skin tone and complexion, exact hair style and color and length, clothing patterns/logos/text, accessories, glasses shape, hats, facial hair style and density, body proportions and build, tattoos, scars, wrinkles.
Preserve small details: number of fingers visible, hand positions, jewelry, watch, rings, earrings, necklace, tie pattern, shoe style, belt, bag, phone in hand, any held objects.
Background must match the input exactly: furniture, walls, windows, plants, screens, signs, text on signs, bottles, cups, food items, decorations. Do NOT invent or remove any background element.
Do NOT add, remove, or rearrange any elements. Do NOT invent background objects, characters, or text that are not in the original.
Maintain the SAME number of people/characters. Do NOT merge, split, or duplicate anyone.
Keep the same lighting direction, shadow placement, time of day, and overall mood.
If there is text in the image (signs, screens, clothing), reproduce it exactly letter-for-letter.

STYLE RULES:
Apply clean, sharp, consistent black outline work characteristic of traditional 2D animation.
Render with the show's distinctive design language: large, expressive eyes with noticeable pupils, simplified yet recognizable facial features, slightly exaggerated proportions.
Use a vibrant, high-saturation color palette with solid base colors and subtle cell-shading for depth. Avoid complex textures or painterly effects.
Backgrounds should match the same crispness with clear lines and vivid colors. The final output must look like a direct screenshot from the animated series.

OUTPUT RULES:
KEEP IT HUMAN. REAL.
Both variants should look as close to the original input as possible while applying the Rick and Morty style.
Prioritize recognizability of the original scene over artistic liberty. When in doubt, stay closer to the input photo rather than taking creative freedom.
`);
