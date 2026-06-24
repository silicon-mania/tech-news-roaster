"use client";

import Image from "next/image";
import type { CSSProperties, Ref } from "react";
import { useLayoutEffect, useRef } from "react";
import {
  quoteTweetBandGradient,
  quoteTweetColors,
  quoteTweetFrame,
  quoteTweetImageRegion,
  quoteTweetLabelBox,
  quoteTweetLabelTypography,
  quoteTweetLogo,
  type TemplateRect,
} from "@/services/final-quote-tweet-image";

/**
 * Label auto-fit policy: the News Category label renders at the Figma design
 * size and shrinks in steps down to the legibility floor until it fits the
 * label box on a single line. Truncation is disallowed — the stamp stays whole.
 */
const labelAutoFit = {
  minScale: 0.4,
  scaleStep: 0.05,
} as const;

const labelScaleVariable = "--quote-tweet-label-scale";

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

const labelBoxStyle: CSSProperties = {
  ...frameRectStyle(quoteTweetLabelBox),
  alignItems: "center",
  display: "flex",
  justifyContent: "center",
  overflow: "hidden",
};

const labelTextStyle: CSSProperties = {
  color: quoteTweetColors.label,
  fontFamily: `"${quoteTweetLabelTypography.fontFamily}", sans-serif`,
  fontSize: `calc(var(${labelScaleVariable}, 1) * ${
    (quoteTweetLabelTypography.fontSizePx / quoteTweetFrame.width) * 100
  }cqw)`,
  fontStyle: quoteTweetLabelTypography.fontStyle,
  fontWeight: quoteTweetLabelTypography.fontWeight,
  letterSpacing: `${quoteTweetLabelTypography.letterSpacingEm}em`,
  lineHeight: quoteTweetLabelTypography.lineHeightPx / quoteTweetLabelTypography.fontSizePx,
  margin: 0,
  textAlign: quoteTweetLabelTypography.textAlign,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};

export function QuoteTweetComposite({
  bandColor,
  imageAlt,
  imageUrl,
  label,
  ref,
}: {
  /** The resolved News Category Color tinting the headline band and gradient. */
  bandColor: string;
  imageAlt: string;
  imageUrl: string;
  label: string;
  /** Exposes the composite root so Download can rasterize this exact node. */
  ref?: Ref<HTMLElement>;
}) {
  const labelTextRef = useRef<HTMLParagraphElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect measures the DOM rendered from label, so it must re-fit when the label changes.
  useLayoutEffect(() => {
    const labelText = labelTextRef.current;
    const labelBox = labelText?.parentElement;

    if (!labelText || !labelBox) {
      return;
    }

    let disposed = false;

    // Shrink the single line until it fits the box width; never truncate.
    const fitLabel = () => {
      if (disposed) {
        return;
      }

      let scale = 1;

      labelText.style.setProperty(labelScaleVariable, String(scale));

      while (scale > labelAutoFit.minScale && labelText.scrollWidth > labelBox.clientWidth) {
        scale = Math.max(labelAutoFit.minScale, scale - labelAutoFit.scaleStep);
        labelText.style.setProperty(labelScaleVariable, String(scale));
      }
    };

    fitLabel();
    // Re-fit once the bundled face loads — fallback-font metrics measure differently.
    document.fonts?.ready.then(fitLabel, () => undefined);

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(fitLabel);

    resizeObserver?.observe(labelBox);

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
    };
  }, [label]);

  return (
    <figure
      aria-label="Final Quote Tweet Image preview"
      className="relative w-full overflow-hidden"
      ref={ref}
      style={{
        aspectRatio: `${quoteTweetFrame.width} / ${quoteTweetFrame.height}`,
        backgroundColor: bandColor,
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
          // Fade transparent -> band color; `${bandColor}00` is the band hue at
          // zero alpha, avoiding the muddy midpoint a plain `transparent` stop
          // (transparent black) would introduce on a colored band.
          background: `linear-gradient(${quoteTweetBandGradient.angleDeg}deg, ${bandColor}00, ${bandColor})`,
        }}
      />
      <Image
        alt=""
        aria-hidden
        className="object-contain object-left-top"
        height={quoteTweetLogo.height}
        src={quoteTweetLogo.src}
        style={frameRectStyle(quoteTweetLogo)}
        unoptimized
        width={quoteTweetLogo.width}
      />
      <figcaption style={labelBoxStyle}>
        <p ref={labelTextRef} style={labelTextStyle}>
          {label}
        </p>
      </figcaption>
    </figure>
  );
}
