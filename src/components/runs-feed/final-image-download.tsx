"use client";

import { Download } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildFinalQuoteTweetImageDownloadName } from "@/components/workspace/image-helpers";
import { QuoteTweetComposite } from "@/components/workspace/quote-tweet-composite";
import {
  type CompositeRasterizer,
  rasterizeCompositeToPng,
} from "@/services/final-quote-tweet-image";
import { resolveBandColor, resolveNewsCategoryStamp } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { resolveRunCardContent } from "./resolve-run-card-content";

/**
 * The Selected Run sidebar's Final Quote Tweet Image section: a faithful preview
 * of the composite the run becomes, plus a Download action that saves it as the
 * lossless PNG — the same export the workspace overlay offers, brought to the
 * Runs Feed editor so the operator can grab the final image without entering the
 * workspace.
 *
 * The PNG is captured from this exact preview node (preview equals download, per
 * [ADR 0018](../../../docs/adr/0018-deterministic-derived-final-quote-tweet-image.md)),
 * reusing the shared {@link rasterizeCompositeToPng} so quality and geometry match
 * the workspace bit-for-bit. The image variation resolves exactly as the Run Card
 * does — the operator's explicit choice or the first-of-each fallback via
 * {@link resolveRunCardContent} — so the download always matches what the card
 * shows. A Selected Run is always a Complete Run, so the variation resolves and
 * the download is always available.
 */
export function FinalImageDownload({
  rasterizeComposite = rasterizeCompositeToPng,
  run,
}: {
  rasterizeComposite?: CompositeRasterizer;
  run: GenerationRun;
}) {
  const compositeRef = useRef<HTMLElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const { variation } = resolveRunCardContent(run);

  // A Complete Run always resolves a variation, but guard so an incomplete run
  // reaching the sidebar renders nothing here rather than a broken composite.
  if (!variation) {
    return null;
  }

  const downloadName = `${buildFinalQuoteTweetImageDownloadName(run.label)}.png`;

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
    <section aria-label="Final image" className="grid min-w-0 gap-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="title-serif text-foreground text-lg">Final image</h3>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label="Download final quote tweet image"
                className="shrink-0 text-muted-foreground"
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
      <div className="overflow-hidden rounded-xl">
        <QuoteTweetComposite
          bandColor={resolveBandColor(run.newsCategory)}
          imageAlt={variation.altText ?? variation.label}
          imageUrl={variation.url}
          label={resolveNewsCategoryStamp(run.newsCategory)}
          ref={compositeRef}
        />
      </div>
    </section>
  );
}
