"use client";

import { Download, Maximize2, Minimize2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type CompositeRasterizer,
  quoteTweetLogo,
  rasterizeCompositeToPng,
} from "@/services/final-quote-tweet-image";
import {
  collectCompletedImageSets,
  resolveBandColor,
  resolveNewsCategoryStamp,
} from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { buildFinalQuoteTweetImageDownloadName } from "./image-helpers";
import { QuoteTweetComposite } from "./quote-tweet-composite";
import { findSelectedVariation } from "./quote-tweet-selection";
import { useQuoteTweetOverlayState } from "./use-quote-tweet-overlay-state";

// The composite needs only the image; when it is missing the overlay asks for
// that one pick (ADR-0026).
const missingImageMessage = "Select a generated image to assemble the final quote tweet image.";

// The overlay chrome is a deliberate light surface against the dark-only app —
// it frames the composite like a print, matching the design. Scoped zinc/white
// utilities keep it self-contained without adding competing color variables;
// `dark:hover:*` overrides stop the dark root's ghost-button variants leaking in.
const cardClassName =
  "w-[min(18rem,calc(100vw-2rem))] origin-bottom-right overflow-hidden rounded-2xl bg-white text-zinc-900 shadow-xl shadow-black/40 ring-1 ring-black/5";
const iconButtonClassName =
  "text-zinc-500 hover:bg-zinc-900/5 hover:text-zinc-900 dark:hover:bg-zinc-900/5 dark:hover:text-zinc-900";

/**
 * Sticky bottom-right overlay that renders the run's Final Quote Tweet Image.
 * It owns no selection state — it derives the composite from the run's Selected
 * Generated Image plus its News Category stamp and re-renders instantly as either
 * changes. It mounts only once the run has at least one completed Image Set —
 * source-derived or uploaded (ADR-0025), so an upload-only run still gets its
 * Final Quote Tweet Image; total image failure (no completed sets) leaves it
 * hidden and the Image work area carries that failure instead.
 */
export function FinalQuoteTweetImageOverlay({
  rasterizeComposite = rasterizeCompositeToPng,
  run,
}: {
  rasterizeComposite?: CompositeRasterizer;
  run: GenerationRun | null;
}) {
  const compositeRef = useRef<HTMLElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const { collapse, expand, isExpanded } = useQuoteTweetOverlayState({
    runId: run?.id ?? null,
    selectedImageOptionId: run?.selectedGeneratedImage?.imageOptionId ?? null,
  });

  const hasCompletedImageSet = run ? collectCompletedImageSets(run).length > 0 : false;
  const isAvailable = Boolean(run) && hasCompletedImageSet;

  if (!run || !isAvailable) {
    return null;
  }

  const selectedVariation = findSelectedVariation(
    collectCompletedImageSets(run),
    run.selectedGeneratedImage ?? null,
  );
  const downloadName = buildFinalQuoteTweetImageDownloadName(run.label);
  const bandColor = resolveBandColor(run.newsCategory, run.newsCategoryColor);

  async function downloadComposite() {
    const compositeNode = compositeRef.current;

    if (!compositeNode || isDownloading) {
      return;
    }

    setIsDownloading(true);

    try {
      const pngDataUrl = await rasterizeComposite(compositeNode);
      const anchor = document.createElement("a");

      anchor.download = downloadName;
      anchor.href = pngDataUrl;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      toast.error("Couldn't download the final quote tweet image");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <section
      aria-label="Final Quote Tweet Image Creative Result Area"
      className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
      {isExpanded ? (
        <div
          className={`${cardClassName} animate-in duration-200 fade-in slide-in-from-bottom-1 zoom-in-95`}>
          <div className="flex justify-end px-2 pt-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Collapse final quote tweet image"
                    className={iconButtonClassName}
                    onClick={collapse}
                    size="icon"
                    type="button"
                    variant="ghost"
                  />
                }>
                <Minimize2 aria-hidden className="size-4" strokeWidth={1.75} />
              </TooltipTrigger>
              <TooltipContent>Collapse</TooltipContent>
            </Tooltip>
          </div>
          {selectedVariation ? (
            <>
              <div className="px-2">
                <div className="overflow-hidden rounded-xl">
                  <QuoteTweetComposite
                    bandColor={bandColor}
                    imageAlt={selectedVariation.altText ?? selectedVariation.label}
                    imageUrl={selectedVariation.url}
                    label={resolveNewsCategoryStamp(run.newsCategory)}
                    ref={compositeRef}
                  />
                </div>
              </div>
              <div className="flex justify-end px-2 pt-1 pb-2">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="Download final quote tweet image"
                        className={iconButtonClassName}
                        disabled={isDownloading}
                        onClick={() => void downloadComposite()}
                        size="icon"
                        type="button"
                        variant="ghost"
                      />
                    }>
                    <Download aria-hidden className="size-4" strokeWidth={1.75} />
                  </TooltipTrigger>
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
              </div>
            </>
          ) : (
            <p className="px-4 pt-1 pb-6 text-center text-sm text-zinc-600 leading-6" role="status">
              {missingImageMessage}
            </p>
          )}
        </div>
      ) : (
        <button
          aria-label="Expand final quote tweet image"
          className={`group block ${cardClassName} animate-in duration-200 fade-in zoom-in-95`}
          onClick={expand}
          type="button">
          <span className="flex justify-end px-2 pt-2 pb-4">
            <span className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-500 transition-colors group-hover:bg-zinc-900/5 group-hover:text-zinc-900">
              <Maximize2 aria-hidden className="size-4" strokeWidth={1.75} />
            </span>
          </span>
          <span
            className="flex items-center justify-center px-6 py-4"
            style={{ backgroundColor: bandColor }}>
            <Image
              alt=""
              aria-hidden
              className="h-6 w-auto object-contain"
              height={quoteTweetLogo.height}
              src={quoteTweetLogo.src}
              unoptimized
              width={quoteTweetLogo.width}
            />
          </span>
        </button>
      )}
    </section>
  );
}
