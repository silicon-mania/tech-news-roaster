"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import Image from "next/image";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ImageSet } from "@/services/generation";
import { buildImageDownloadName } from "./image-helpers";

export function ImageOptionModal({
  imageSet,
  optionIndex,
  onClose,
  onOptionIndexChange,
}: {
  imageSet: ImageSet;
  optionIndex: number;
  onClose: () => void;
  onOptionIndexChange: (optionIndex: number) => void;
}) {
  const option = imageSet.options[optionIndex];
  const canGoPrevious = optionIndex > 0;
  const canGoNext = optionIndex < imageSet.options.length - 1;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}>
      <DialogContent
        showCloseButton={false}
        className="inset-0 max-w-none translate-x-0 translate-y-0 grid-rows-[auto_1fr_auto] rounded-none bg-background/96 p-3 ring-0 backdrop-blur-sm sm:max-w-none sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <DialogTitle className="text-sm">
              <span aria-hidden>{option.label}</span>
              <span className="sr-only">{`${option.label} image option`}</span>
            </DialogTitle>
            <p className="truncate text-muted-foreground text-xs">
              {imageSet.selectedImageOriginal.title ?? imageSet.id}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={
                  <a
                    aria-label="Download current image option"
                    className={buttonVariants({ size: "icon", variant: "ghost" })}
                    download={buildImageDownloadName(imageSet, option)}
                    href={option.url}>
                    <Download aria-hidden className="size-4" />
                  </a>
                }
              />
              <TooltipContent>Download</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label="Close image option"
                    className="text-muted-foreground"
                    onClick={onClose}
                    size="icon"
                    variant="ghost"
                  />
                }>
                <X aria-hidden className="size-4" />
              </TooltipTrigger>
              <TooltipContent>Close</TooltipContent>
            </Tooltip>
          </div>
        </div>
        <div className="grid min-h-0 place-items-center py-4">
          <Image
            alt={option.altText ?? option.label}
            className="max-h-full w-auto max-w-full object-contain"
            height={900}
            src={option.url}
            unoptimized
            width={1200}
          />
        </div>
        <div className="grid grid-cols-2 items-center gap-2">
          <Button
            aria-label="Previous image option"
            disabled={!canGoPrevious}
            onClick={() => onOptionIndexChange(optionIndex - 1)}
            size="lg"
            variant="secondary">
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button
            aria-label="Next image option"
            disabled={!canGoNext}
            onClick={() => onOptionIndexChange(optionIndex + 1)}
            size="lg"
            variant="secondary">
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
