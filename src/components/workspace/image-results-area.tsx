"use client";

import { Download, Expand, Eye } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { FailedImageSet, ImageSet } from "@/services/generation";
import { FailureDetails } from "./failure-details";
import { buildImageDownloadName } from "./image-helpers";
import { ImageOptionModal } from "./image-option-modal";
import { TextRevealModal } from "./text-reveal-modal";

const imageOptionCellClassName = "w-[min(70vw,18rem)] shrink-0 lg:w-[min(18vw,300px)]";
const overlayActionClassName = "bg-background/80 text-foreground hover:bg-background";
// One Selected Image Original plus its four variations.
const imageSetOptionCount = 5;

export function ImageResultsArea({
  failedImageSet,
  imageSet,
  isGenerationPending = false,
  selectedGeneratedImageOptionId,
  onSelectedGeneratedImageChange,
}: {
  failedImageSet?: FailedImageSet;
  imageSet?: ImageSet;
  isGenerationPending?: boolean;
  selectedGeneratedImageOptionId: string | null;
  onSelectedGeneratedImageChange: (imageOptionId: string | null) => void;
}) {
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);
  const [isFailureOpen, setIsFailureOpen] = useState(false);
  const activeOptionIndex =
    imageSet && activeOptionId
      ? imageSet.options.findIndex((option) => option.id === activeOptionId)
      : -1;

  return (
    <section aria-label="Image results area" className="grid gap-3">
      <div className="grid gap-4">
        {imageSet ? (
          <article
            aria-label="Image set"
            className="grid min-w-0 gap-2 rounded-md bg-card/60 p-2"
            key={imageSet.id}>
            <p className="font-medium text-foreground/90 text-xs">
              {imageSet.selectedImageOriginal.title ?? "Image set"}
            </p>
            <div className="overflow-x-auto pb-2">
              <ul className="flex w-max gap-2 pr-2">
                {imageSet.options.map((option, optionIndex) => {
                  const isSelected = selectedGeneratedImageOptionId === option.id;

                  return (
                    <li className={imageOptionCellClassName} key={option.id}>
                      <div
                        className={`group grid w-full gap-1.5 rounded-md text-left transition ${
                          isSelected ? "bg-primary/10 ring-1 ring-primary/45" : "bg-card/50"
                        }`}>
                        <div className="relative aspect-[4/3] overflow-hidden rounded-md bg-secondary">
                          <button
                            type="button"
                            aria-label={`Open ${option.label}`}
                            onClick={() => setActiveOptionId(option.id)}
                            className="block h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40">
                            <Image
                              alt={option.altText ?? option.label}
                              className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                              height={240}
                              loading={optionIndex === 0 ? "eager" : "lazy"}
                              src={option.url}
                              unoptimized
                              width={320}
                            />
                          </button>
                          <div className="absolute top-2 right-2 flex gap-1 opacity-0 shadow-black/30 shadow-lg transition group-focus-within:opacity-100 group-hover:opacity-100">
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <Button
                                    aria-label={`Expand ${option.label}`}
                                    className={overlayActionClassName}
                                    onClick={() => setActiveOptionId(option.id)}
                                    size="icon"
                                    type="button"
                                    variant="ghost"
                                  />
                                }>
                                <Expand aria-hidden className="size-3.5" />
                              </TooltipTrigger>
                              <TooltipContent>Expand</TooltipContent>
                            </Tooltip>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  <a
                                    aria-label={`Download ${option.label}`}
                                    className={cn(
                                      buttonVariants({ size: "icon", variant: "ghost" }),
                                      overlayActionClassName,
                                    )}
                                    download={buildImageDownloadName(imageSet, option)}
                                    href={option.url}>
                                    <Download aria-hidden className="size-3.5" />
                                  </a>
                                }
                              />
                              <TooltipContent>Download</TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <div className="flex items-center justify-between gap-2 px-0.5 pb-1">
                          <span className="text-muted-foreground text-xs">{option.label}</span>
                          {option.kind === "variation" ? (
                            <Button
                              aria-label={
                                isSelected
                                  ? `Clear ${option.label} selection`
                                  : `Select ${option.label}`
                              }
                              aria-pressed={isSelected}
                              className={`min-w-20 font-medium text-xs ${
                                isSelected ? "bg-primary/15 text-primary hover:bg-primary/25" : ""
                              }`}
                              onClick={() =>
                                onSelectedGeneratedImageChange(isSelected ? null : option.id)
                              }
                              size="sm"
                              type="button"
                              variant="secondary">
                              {isSelected ? "Selected" : "Select"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </article>
        ) : null}
        {isGenerationPending ? (
          <article
            aria-busy="true"
            aria-label="Pending image set"
            className="grid min-w-0 gap-2 rounded-md bg-card/60 p-2">
            <Skeleton className="h-4 w-40" />
            <div className="overflow-x-auto pb-2">
              <ul className="flex w-max gap-2 pr-2">
                {Array.from({ length: imageSetOptionCount }, (_, optionIndex) => (
                  <li
                    className={imageOptionCellClassName}
                    // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity beyond position
                    key={`pending-image-option-${optionIndex}`}>
                    <div className="grid w-full gap-1.5 rounded-md bg-card/50">
                      <Skeleton className="aspect-[4/3] w-full rounded-md" />
                      <Skeleton className="mx-0.5 mb-1 h-3.5 w-24" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ) : null}
        {failedImageSet ? (
          <article
            aria-label="Failed image set"
            className="grid gap-1 rounded-md bg-destructive/10 p-3"
            key={failedImageSet.id}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-medium text-destructive text-sm">Image set failed</p>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      aria-label="Open Quiet Failure Details for failed image set"
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
            <p className="text-destructive/80 text-xs leading-5">
              This image set could not be generated.
            </p>
          </article>
        ) : null}
      </div>
      {failedImageSet && isFailureOpen ? (
        <TextRevealModal title="Quiet Failure Details" onClose={() => setIsFailureOpen(false)}>
          <FailureDetails
            failure={{
              message: failedImageSet.message,
              failedAt: failedImageSet.failedAt,
            }}
          />
        </TextRevealModal>
      ) : null}
      {imageSet && activeOptionIndex >= 0 ? (
        <ImageOptionModal
          imageSet={imageSet}
          optionIndex={activeOptionIndex}
          onClose={() => setActiveOptionId(null)}
          onOptionIndexChange={(optionIndex) =>
            setActiveOptionId(imageSet.options[optionIndex]?.id ?? null)
          }
        />
      ) : null}
    </section>
  );
}
