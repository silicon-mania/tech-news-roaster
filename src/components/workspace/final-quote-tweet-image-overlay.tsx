"use client";

import { Download, Maximize2, Minimize2 } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type CompositeRasterizer,
  quoteTweetRainbowStripe,
  rasterizeCompositeToPng,
} from "@/services/final-quote-tweet-image";
import type { GenerationRun } from "@/services/workspace";
import { buildFinalQuoteTweetImageDownloadName } from "./image-helpers";
import { QuoteTweetComposite } from "./quote-tweet-composite";
import {
  findSelectedVariation,
  findSelectedVisualJoke,
  getMissingPickMessage,
} from "./quote-tweet-selection";
import { useQuoteTweetOverlayState } from "./use-quote-tweet-overlay-state";

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
 * It owns no selection state — it derives the composite from the active run's
 * two picks and re-renders instantly as they change. It mounts only once the run
 * has both a generated image set and visual jokes; total image failure (no sets)
 * leaves it hidden and the Image work area carries that failure instead.
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
    selectedVisualJokeId: run?.selectedVisualJoke?.visualJokeId ?? null,
  });

  const imageSet = run?.imageSet;
  const jokes = run?.visualJokeSet?.jokes ?? [];
  const isAvailable = Boolean(run) && Boolean(imageSet) && jokes.length > 0;

  if (!run || !isAvailable) {
    return null;
  }

  const selectedVariation = findSelectedVariation(imageSet, run.selectedGeneratedImage ?? null);
  const selectedVisualJoke = findSelectedVisualJoke(
    run.visualJokeSet,
    run.selectedVisualJoke ?? null,
  );
  const bothSelected = Boolean(selectedVariation && selectedVisualJoke);
  const downloadName = buildFinalQuoteTweetImageDownloadName(run.label);

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
          {bothSelected && selectedVariation && selectedVisualJoke ? (
            <>
              <div className="px-2">
                <div className="overflow-hidden rounded-xl">
                  <QuoteTweetComposite
                    imageAlt={selectedVariation.altText ?? selectedVariation.label}
                    imageUrl={selectedVariation.url}
                    jokeTitle={selectedVisualJoke.text}
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
              {getMissingPickMessage({
                isImageMissing: !selectedVariation,
                isJokeMissing: !selectedVisualJoke,
              })}
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
          <Image
            alt=""
            aria-hidden
            className="h-auto w-full"
            height={quoteTweetRainbowStripe.height}
            src={quoteTweetRainbowStripe.src}
            unoptimized
            width={quoteTweetRainbowStripe.width}
          />
        </button>
      )}
    </section>
  );
}
