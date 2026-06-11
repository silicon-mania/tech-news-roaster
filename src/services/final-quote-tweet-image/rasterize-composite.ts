import { toPng } from "html-to-image";
import { quoteTweetFrame } from "./template";

/**
 * Turns the live composite preview node into a PNG data URL. Injected into the
 * composition UI (defaulting to the real html-to-image capture below) so
 * Download stays testable without rasterizing in jsdom.
 */
export type CompositeRasterizer = (compositeNode: HTMLElement) => Promise<string>;

/**
 * Captures the exact preview DOM node, so preview equals download — one
 * renderer, no drift.
 *
 * - Gated on `document.fonts.ready` so the bundled serif is embedded before
 *   rasterization instead of a fallback face (the font-loading race).
 * - The canvas is pinned to the template's native frame at `pixelRatio: 2`, so
 *   the PNG is the template's native size at 2x density no matter what
 *   responsive size the preview happens to render at on screen.
 * - html-to-image inlines every `<img>` into the capture: gateway variations
 *   already arrive as base64 data URLs and are persisted verbatim, and the
 *   local dev provider's remote picsum URLs are fetched and embedded by that
 *   same step, so the capture never taints.
 */
export const rasterizeCompositeToPng: CompositeRasterizer = async (compositeNode) => {
  await document.fonts.ready;

  return toPng(compositeNode, {
    canvasHeight: quoteTweetFrame.height,
    canvasWidth: quoteTweetFrame.width,
    pixelRatio: 2,
  });
};
