"use client";

import { Download, Expand } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { buildImageDownloadName } from "@/components/workspace/image-helpers";
import { ImageOptionModal } from "@/components/workspace/image-option-modal";
import { cn } from "@/lib/utils";
import type { ImageSet } from "@/services/generation";

const imageOptionCellClassName = "w-[min(70vw,18rem)] shrink-0 lg:w-[min(18vw,300px)]";
const overlayActionClassName = "bg-background/80 text-foreground hover:bg-background";

/**
 * One completed Image Set rendered as the Image Set article (ADR-0025): a
 * horizontal Selected Image Original plus its four variations, each openable
 * full-screen and downloadable, with only the variations selectable as the
 * run-wide Selected Generated Image. The `heading` is the set's positional label
 * ("Image set N") and doubles as the article's accessible name, so a stack of
 * sets stays distinguishable. Owns its own full-screen modal state, so opening a
 * variation in one set never disturbs another.
 */
export function ImageSetArticle({
  heading,
  imageSet,
  onSelectedGeneratedImageChange,
  selectedGeneratedImageOptionId,
}: {
  heading: string;
  imageSet: ImageSet;
  onSelectedGeneratedImageChange: (imageOptionId: string | null) => void;
  selectedGeneratedImageOptionId: string | null;
}) {
  const [activeOptionId, setActiveOptionId] = useState<string | null>(null);
  const activeOptionIndex = activeOptionId
    ? imageSet.options.findIndex((option) => option.id === activeOptionId)
    : -1;

  return (
    <article
      aria-label={heading}
      className="grid min-w-0 gap-2 rounded-md bg-card/60 p-2"
      key={imageSet.id}>
      <p className="font-medium text-foreground/90 text-xs">{heading}</p>
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
                          isSelected ? `Clear ${option.label} selection` : `Select ${option.label}`
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
      {activeOptionIndex >= 0 ? (
        <ImageOptionModal
          imageSet={imageSet}
          optionIndex={activeOptionIndex}
          onClose={() => setActiveOptionId(null)}
          onOptionIndexChange={(optionIndex) =>
            setActiveOptionId(imageSet.options[optionIndex]?.id ?? null)
          }
        />
      ) : null}
    </article>
  );
}
