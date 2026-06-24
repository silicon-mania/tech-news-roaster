/**
 * Baked Locked-In Quote Tweet template.
 *
 * Re-extracted once from Figma node 4131 (file BRspEDx97oRutl2hM0NqpP) — the
 * category-frame template — and committed so runtime composition never depends
 * on Figma or its API. Every category renders the same structure: an image
 * filling the area above a colored headline band, a vertical fade blending the
 * two, a centered single-line News Category label (CompactaICG Italic), and the
 * fixed top-left Locked-In Logo. Only the band color and the label text change.
 *
 * All geometry is in the template's native pixel space (top-left origin); both
 * the live preview and the 2x rasterization scale from these numbers.
 *
 * See docs/adr/0029-category-colored-quote-tweet-template-and-locked-in-logo.md
 * (amends docs/adr/0018-deterministic-derived-final-quote-tweet-image.md).
 */

/** A rectangle in the template's native pixel space. */
export interface TemplateRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Fixed portrait frame at native resolution. */
export const quoteTweetFrame = { width: 3240, height: 4050 } as const;

/**
 * Colored headline band (Figma `fill-rectangle`) pinned to the bottom of the
 * frame. It carries no color of its own here — the composite tints it at
 * runtime with the run's resolved band color (ADR-0029), surfaced as the
 * composite's background showing through below the image region.
 */
export const quoteTweetBand: TemplateRect = {
  x: 0,
  y: 2997,
  width: 3240,
  height: 1053,
};

/** Region the Selected Generated Image fills (cover, center) — everything above the band. */
export const quoteTweetImageRegion: TemplateRect = {
  x: 0,
  y: 0,
  width: 3240,
  height: 2997, // == quoteTweetBand.y — the image meets the band top
};

/**
 * Centered label box inside the band (Figma `news-category` text). The News
 * Category label is centered horizontally and vertically and renders on a
 * single line, shrinking to fit this width rather than truncating. The band is
 * inset symmetrically so even the widest preset (PUBLISHED, ~2442px at the
 * design size) clears it with slack for Figma↔browser metric drift; a longer
 * custom word shrinks to fit.
 */
export const quoteTweetLabelBox: TemplateRect = {
  x: 240,
  y: 3051,
  width: 2760,
  height: 946,
};

/**
 * Vertical fade that blends the image into the band (Figma `Rectangle 124`):
 * transparent at the top, the resolved band color at the bottom. Reproduced as
 * a CSS gradient (not a baked bitmap) so it always tracks the runtime band
 * color. It overlaps the bottom of the image region and meets the band top, so
 * the seam between picture and band is invisible.
 */
export const quoteTweetBandGradient = {
  x: 0,
  y: 2186,
  width: 3240,
  height: 811, // 2186 + 811 == quoteTweetBand.y
  angleDeg: 180,
} as const;

/**
 * The Locked-In Logo — the fixed top-left brand mark (Figma `top-left-logo`).
 * Committed as an SVG with outlined text (vector paths, no `<text>`), so it is
 * font-independent and crisp at the 2x rasterization, and a future rebrand is a
 * file swap (plus this rect if the proportions change). Rendered as one `<img>`,
 * identical on every category and run.
 */
export const quoteTweetLogo = {
  src: "/assets/quote-tweet/locked-in-logo.svg",
  x: 72,
  y: 30,
  width: 516,
  height: 204,
} as const;

/** Flat colors used by the static layers. The band color is a runtime prop. */
export const quoteTweetColors = {
  /** The label text — a single white constant on every band (ADR-0029 needs no per-category foreground). */
  label: "#FFFFFF",
} as const;

/**
 * Label typography. The face is **CompactaICG** (Compacta ICG Italic) — a
 * deliberate change from Figma's Vina Sans during slice 004 (see ADR-0029), the
 * template being expected to keep evolving. `fontSizePx` is the design ceiling
 * the composition auto-fits down from, so the label never renders larger and
 * shrinks to fit the label box on a single line. The face is bundled and
 * registered via a hand-written @font-face (see src/app/globals.css), not
 * next/font.
 */
export const quoteTweetLabelTypography = {
  fontFamily: "CompactaICG",
  fontWeight: 500,
  fontStyle: "italic",
  fontSizePx: 778, // design ceiling the label auto-fits down from; the cqw scaling makes the exact value moot
  lineHeightPx: 778,
  letterSpacingEm: -0.02,
  textAlign: "center",
} as const;
