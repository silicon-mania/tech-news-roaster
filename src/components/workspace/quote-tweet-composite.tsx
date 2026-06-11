"use client";

import Image from "next/image";
import type { CSSProperties, Ref } from "react";
import { useLayoutEffect, useRef } from "react";
import {
  quoteTweetBandGradient,
  quoteTweetColors,
  quoteTweetFrame,
  quoteTweetImageRegion,
  quoteTweetRainbowStripe,
  quoteTweetTitleBox,
  quoteTweetTitleTypography,
  type TemplateRect,
} from "@/services/final-quote-tweet-image";

/**
 * Joke Title auto-fit policy: the title renders at the Figma design size and
 * shrinks in steps down to the legibility floor until it fits the title box.
 * Truncation is disallowed — the non-editable punchline must stay whole.
 */
const titleAutoFit = {
  minScale: 0.4,
  scaleStep: 0.05,
} as const;

const titleScaleVariable = "--quote-tweet-title-scale";

/** Positions a template-space rectangle as a percentage of the frame. */
function frameRectStyle(rect: TemplateRect): CSSProperties {
  return {
    height: `${(rect.height / quoteTweetFrame.height) * 100}%`,
    left: `${(rect.x / quoteTweetFrame.width) * 100}%`,
    position: "absolute",
    top: `${(rect.y / quoteTweetFrame.height) * 100}%`,
    width: `${(rect.width / quoteTweetFrame.width) * 100}%`,
  };
}

const titleTextStyle: CSSProperties = {
  color: quoteTweetColors.title,
  fontFamily: `"${quoteTweetTitleTypography.fontFamily}", serif`,
  fontSize: `calc(var(${titleScaleVariable}, 1) * ${
    (quoteTweetTitleTypography.fontSizePx / quoteTweetFrame.width) * 100
  }cqw)`,
  fontStyle: quoteTweetTitleTypography.fontStyle,
  fontWeight: quoteTweetTitleTypography.fontWeight,
  letterSpacing: `${quoteTweetTitleTypography.letterSpacingEm}em`,
  lineHeight: quoteTweetTitleTypography.lineHeightPx / quoteTweetTitleTypography.fontSizePx,
  overflowWrap: "break-word",
  textAlign: quoteTweetTitleTypography.textAlign,
};

export function QuoteTweetComposite({
  imageAlt,
  imageUrl,
  jokeTitle,
  ref,
}: {
  imageAlt: string;
  imageUrl: string;
  jokeTitle: string;
  /** Exposes the composite root so Download can rasterize this exact node. */
  ref?: Ref<HTMLElement>;
}) {
  const titleBoxRef = useRef<HTMLElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect measures the DOM rendered from jokeTitle, so it must re-fit when the title changes.
  useLayoutEffect(() => {
    const titleBox = titleBoxRef.current;

    if (!titleBox) {
      return;
    }

    let disposed = false;

    const fitTitle = () => {
      if (disposed) {
        return;
      }

      let scale = 1;

      titleBox.style.setProperty(titleScaleVariable, String(scale));

      while (scale > titleAutoFit.minScale && titleBox.scrollHeight > titleBox.clientHeight) {
        scale = Math.max(titleAutoFit.minScale, scale - titleAutoFit.scaleStep);
        titleBox.style.setProperty(titleScaleVariable, String(scale));
      }
    };

    fitTitle();
    // Re-fit once the bundled serif loads — fallback-font metrics wrap differently.
    document.fonts?.ready.then(fitTitle, () => undefined);

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fitTitle);

    resizeObserver?.observe(titleBox);

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
    };
  }, [jokeTitle]);

  return (
    <figure
      aria-label="Final Quote Tweet Image preview"
      className="relative w-full overflow-hidden"
      ref={ref}
      style={{
        aspectRatio: `${quoteTweetFrame.width} / ${quoteTweetFrame.height}`,
        backgroundColor: quoteTweetColors.band,
        containerType: "inline-size",
      }}>
      <Image
        alt={imageAlt}
        className="object-cover object-center"
        height={quoteTweetImageRegion.height}
        src={imageUrl}
        style={frameRectStyle(quoteTweetImageRegion)}
        unoptimized
        width={quoteTweetImageRegion.width}
      />
      <div
        aria-hidden
        style={{
          ...frameRectStyle(quoteTweetBandGradient),
          background: `linear-gradient(${quoteTweetBandGradient.angleDeg}deg, ${quoteTweetBandGradient.from}, ${quoteTweetBandGradient.to})`,
        }}
      />
      <Image
        alt=""
        aria-hidden
        height={quoteTweetRainbowStripe.height}
        src={quoteTweetRainbowStripe.src}
        style={frameRectStyle(quoteTweetRainbowStripe)}
        unoptimized
        width={quoteTweetRainbowStripe.width}
      />
      <figcaption ref={titleBoxRef} style={frameRectStyle(quoteTweetTitleBox)}>
        <p style={titleTextStyle}>{jokeTitle}</p>
      </figcaption>
    </figure>
  );
}
