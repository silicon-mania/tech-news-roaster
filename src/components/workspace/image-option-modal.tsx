"use client";

import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import Image from "next/image";
import type { ImageSet } from "@/services/generation";
import { buildImageDownloadName } from "./image-helpers";
import { useCloseOnEscape } from "./use-close-on-escape";

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

  useCloseOnEscape(onClose);

  return (
    <div
      aria-label={`${option.label} image option`}
      aria-modal="true"
      className="fixed inset-0 z-50 grid grid-rows-[auto_1fr_auto] bg-slate-950/96 p-3 text-slate-100 backdrop-blur-sm sm:p-5"
      role="dialog">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{option.label}</p>
          <p className="truncate text-slate-500 text-xs">
            {imageSet.selectedImageOriginal.title ?? imageSet.id}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <a
            aria-label="Download current image option"
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-slate-100 text-slate-950 transition hover:bg-white focus:outline-none focus:ring-2 focus:ring-sky-300/20"
            download={buildImageDownloadName(imageSet, option)}
            href={option.url}>
            <Download aria-hidden className="h-4 w-4" />
          </a>
          <button
            type="button"
            aria-label="Close image option"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-sm bg-slate-900/80 text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
            <X aria-hidden className="h-4 w-4" />
          </button>
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
        <button
          type="button"
          aria-label="Previous image option"
          disabled={!canGoPrevious}
          onClick={() => onOptionIndexChange(optionIndex - 1)}
          className="inline-flex h-10 items-center justify-center rounded-sm bg-slate-900/80 text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
          <ChevronLeft aria-hidden className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="Next image option"
          disabled={!canGoNext}
          onClick={() => onOptionIndexChange(optionIndex + 1)}
          className="inline-flex h-10 items-center justify-center rounded-sm bg-slate-900/80 text-slate-300 transition hover:bg-slate-800 hover:text-slate-100 disabled:cursor-not-allowed disabled:text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
          <ChevronRight aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
