"use client";

import { Download } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type CompositeRasterizer,
  rasterizeCompositeToPng,
} from "@/services/final-quote-tweet-image";
import type {
  ImageSet,
  SelectedGeneratedImage,
  SelectedVisualJoke,
  VisualJoke,
  VisualJokeSet,
} from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { CreativeFailureArea } from "./creative-failure-area";
import type { StageFailure } from "./failure-details";
import { buildFinalQuoteTweetImageDownloadName } from "./image-helpers";
import { QuoteTweetComposite } from "./quote-tweet-composite";

/**
 * Pure consumer of the run's two picks: it renders the Final Quote Tweet Image
 * composite from the Selected Generated Image and the Selected Visual Joke,
 * and owns no selection state of its own. Its one deliberate action is
 * Download, which rasterizes the live preview node through the injected
 * rasterizer so preview equals download.
 */
export function FinalQuoteTweetImageArea({
  rasterizeComposite = rasterizeCompositeToPng,
  run,
}: {
  rasterizeComposite?: CompositeRasterizer;
  run: GenerationRun;
}) {
  const compositeRef = useRef<HTMLElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const imageSets = run.imageSets ?? [];

  if (imageSets.length === 0) {
    // Failed entirely: the shared failure pattern. Otherwise nothing to
    // assemble yet, so the area stays hidden (CreativeFailureArea renders
    // null without a failure).
    return (
      <CreativeFailureArea
        ariaLabel="Final Quote Tweet Image Creative Result Area"
        detailsLabel="Image Generation Failure Details"
        failure={getEntireImageGenerationFailure(run)}
        heading="Final quote tweet image"
      />
    );
  }

  const selectedVariation = findSelectedVariation(imageSets, run.selectedGeneratedImage ?? null);
  const selectedVisualJoke = findSelectedVisualJoke(
    run.visualJokeSet,
    run.selectedVisualJoke ?? null,
  );

  async function downloadComposite() {
    const compositeNode = compositeRef.current;

    if (!compositeNode || isDownloading) {
      return;
    }

    setIsDownloading(true);

    try {
      const pngDataUrl = await rasterizeComposite(compositeNode);
      const anchor = document.createElement("a");

      anchor.download = buildFinalQuoteTweetImageDownloadName(run.label);
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
    <>
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-medium text-foreground text-lg md:text-2xl">Final quote tweet image</h1>
        {selectedVariation && selectedVisualJoke ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Download final quote tweet image"
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
        ) : null}
      </div>
      <section
        aria-label="Final Quote Tweet Image Creative Result Area"
        className="grid gap-3 bg-card/40 p-3">
        {selectedVariation && selectedVisualJoke ? (
          <div className="mx-auto w-full max-w-sm">
            <QuoteTweetComposite
              imageAlt={selectedVariation.altText ?? selectedVariation.label}
              imageUrl={selectedVariation.url}
              jokeTitle={selectedVisualJoke.text}
              ref={compositeRef}
            />
          </div>
        ) : (
          <p className="text-muted-foreground text-sm leading-6" role="status">
            {getMissingPickMessage({
              isImageMissing: !selectedVariation,
              isJokeMissing: !selectedVisualJoke,
            })}
          </p>
        )}
      </section>
    </>
  );
}

function findSelectedVariation(imageSets: ImageSet[], selection: SelectedGeneratedImage) {
  if (!selection) {
    return null;
  }

  for (const imageSet of imageSets) {
    const variation = imageSet.options.find(
      (option) => option.id === selection.imageOptionId && option.kind === "variation",
    );

    if (variation) {
      return variation;
    }
  }

  return null;
}

function findSelectedVisualJoke(
  visualJokeSet: VisualJokeSet | undefined,
  selection: SelectedVisualJoke,
): VisualJoke | null {
  if (!visualJokeSet || !selection) {
    return null;
  }

  return visualJokeSet.jokes.find((joke) => joke.id === selection.visualJokeId) ?? null;
}

function getMissingPickMessage({
  isImageMissing,
  isJokeMissing,
}: {
  isImageMissing: boolean;
  isJokeMissing: boolean;
}) {
  if (isImageMissing && isJokeMissing) {
    return "Select a generated image and a visual joke to assemble the final quote tweet image.";
  }

  if (isImageMissing) {
    return "Select a generated image to assemble the final quote tweet image.";
  }

  return "Select a visual joke to assemble the final quote tweet image.";
}

function getEntireImageGenerationFailure(run: GenerationRun): StageFailure | undefined {
  const imageGenerationState = run.imageGenerationState;

  if (imageGenerationState?.status !== "failed") {
    return undefined;
  }

  const firstFailedImageSet = run.failedImageSets?.[0];

  return {
    failedAt: firstFailedImageSet?.failedAt ?? imageGenerationState.completedAt,
    message: firstFailedImageSet?.message ?? "Every image set failed to generate.",
    startedAt: imageGenerationState.startedAt,
  };
}
