"use client";

import { Download, Eye } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FailureDetails } from "@/components/workspace/failure-details";
import { TextRevealModal } from "@/components/workspace/text-reveal-modal";
import { cn } from "@/lib/utils";
import type { FailedImageSet } from "@/services/generation";

const imageOptionCellClassName = "w-[min(70vw,18rem)] shrink-0 lg:w-[min(18vw,300px)]";
const overlayActionClassName = "bg-background/80 text-foreground hover:bg-background";

/**
 * A retained failed Image Set in the stack (ADR-0025). It keeps its positional
 * label ("Image set N"), exposes its own Quiet Failure Details behind the same
 * quiet reveal the source-derived set uses, and — for an uploaded attempt — still
 * shows the original image the operator fed it, so a failure can be correlated
 * with its input. Retry is a fresh upload (No Automatic Retry).
 */
export function FailedImageSetArticle({
  failedImageSet,
  heading,
}: {
  failedImageSet: FailedImageSet;
  heading: string;
}) {
  const [isFailureOpen, setIsFailureOpen] = useState(false);
  const original = failedImageSet.selectedImageOriginal;

  return (
    <article
      aria-label={heading}
      className="grid gap-2 rounded-md bg-destructive/10 p-3"
      key={failedImageSet.id}>
      <div className="flex items-start justify-between gap-2">
        <div className="grid gap-0.5">
          <p className="font-medium text-foreground/90 text-xs">{heading}</p>
          <p className="font-medium text-destructive text-sm">Image set failed</p>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`Open Quiet Failure Details for ${heading}`}
                className="text-destructive/80 hover:text-destructive"
                onClick={() => setIsFailureOpen(true)}
                size="icon"
                type="button"
                variant="ghost"
              />
            }>
            <Eye aria-hidden className="size-3.5" strokeWidth={1.75} />
          </TooltipTrigger>
          <TooltipContent>Failure details</TooltipContent>
        </Tooltip>
      </div>
      {original ? (
        <div className={imageOptionCellClassName}>
          <div className="group grid w-full gap-1.5 rounded-md bg-card/50 text-left">
            <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-secondary">
              <Image
                alt={original.altText ?? "Uploaded original"}
                className="h-full w-full object-cover"
                height={240}
                src={original.url}
                unoptimized
                width={320}
              />
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 shadow-black/30 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100">
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <a
                        aria-label="Download Original"
                        className={cn(
                          buttonVariants({ size: "icon", variant: "ghost" }),
                          overlayActionClassName,
                        )}
                        download={`${failedImageSet.id}-original`}
                        href={original.url}>
                        <Download aria-hidden className="size-3.5" />
                      </a>
                    }
                  />
                  <TooltipContent>Download</TooltipContent>
                </Tooltip>
              </div>
            </div>
            <span className="px-0.5 pb-1 text-muted-foreground text-xs">Original</span>
          </div>
        </div>
      ) : null}
      <p className="text-destructive/80 text-xs leading-5">
        This image set could not be generated.
      </p>
      {isFailureOpen ? (
        <TextRevealModal title="Quiet Failure Details" onClose={() => setIsFailureOpen(false)}>
          <FailureDetails
            failure={{
              debugLog: failedImageSet.debugLog,
              failedAt: failedImageSet.failedAt,
              message: failedImageSet.message,
            }}
          />
        </TextRevealModal>
      ) : null}
    </article>
  );
}
