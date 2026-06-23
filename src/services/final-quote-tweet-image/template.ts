/**
 * Baked Silicon Mania Quote Tweet template.
 *
 * Extracted once from Figma node 4016-97 (file BRspEDx97oRutl2hM0NqpP) and
 * committed so runtime composition never depends on Figma or its API. All
 * geometry is in the template's native pixel space (top-left origin); both the
 * live preview and the 2x rasterization scale from these numbers.
 *
 * See docs/adr/0018-deterministic-derived-final-quote-tweet-image.md.
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

/** Top region the Selected Generated Image fills (cover, center anchor). */
export const quoteTweetImageRegion: TemplateRect = {
  x: 0,
  y: 0,
  width: 3240,
  height: 2762,
};

/** Bottom black band that holds the Joke Title. */
export const quoteTweetTitleBand: TemplateRect = {
  x: 0,
  y: 2762,
  width: 3240,
  height: 1288,
};

/** Title text box inside the band (left-aligned, white, auto-fit). */
export const quoteTweetTitleBox: TemplateRect = {
  x: 292,
  y: 2838,
  width: 2790,
  height: 896,
};

/**
 * Vertical gradient that fades the image into the band (transparent -> black,
 * top to bottom). It overlaps the bottom of the image region and the top of the
 * band so the seam between picture and band is invisible.
 */
export const quoteTweetBandGradient = {
  x: 0,
  y: 2132,
  width: 3240,
  height: 647,
  angleDeg: 180,
  from: "rgba(0, 0, 0, 0)",
  to: "rgba(0, 0, 0, 1)",
} as const;

/**
 * Rainbow brand stripe pinned to the top edge. Committed as a bitmap because
 * its segment widths and hues are brand-exact; `segments` records the sampled
 * colors for reference and fallback only.
 */
export const quoteTweetRainbowStripe = {
  src: "/assets/quote-tweet/rainbow-stripe.png",
  x: -3,
  y: -23,
  width: 3243,
  height: 53,
  segments: ["#5dbe3d", "#f5c518", "#f08a1c", "#e63d38", "#9a3db3", "#1fa8e8"],
} as const;

/** Flat colors used by the static layers. */
export const quoteTweetColors = {
  band: "#000000",
  title: "#FFFFFF",
} as const;

/**
 * Exact title typography from Figma. `fontSizePx` is the design ceiling the
 * composition auto-fits down from; the Joke Title never renders larger. The
 * font face itself is bundled and registered via a hand-written @font-face
 * (see src/app/globals.css), not next/font.
 */
export const quoteTweetTitleTypography = {
  fontFamily: "VC Henrietta Condensed",
  fontWeight: 400,
  fontStyle: "normal",
  fontSizePx: 320,
  lineHeightPx: 320,
  letterSpacingEm: -0.02,
  textAlign: "left",
} as const;
