"use client";

import { Download, Expand, Eye } from "lucide-react";
import Image from "next/image";
import { useState } from "react";
import type { FailedImageSet, ImageSet } from "@/services/generation";
import { FailureDetails } from "./failure-details";
import { buildImageDownloadName } from "./image-helpers";
import { ImageOptionModal } from "./image-option-modal";
import { TextRevealModal } from "./text-reveal-modal";

export function ImageResultsArea({
  failedImageSets,
  imageSets,
}: {
  failedImageSets: FailedImageSet[];
  imageSets: ImageSet[];
}) {
  const [activeModal, setActiveModal] = useState<{
    imageSetId: string;
    optionId: string;
  } | null>(null);
  const [activeFailureId, setActiveFailureId] = useState<string | null>(null);
  const activeImageSet = activeModal
    ? imageSets.find((imageSet) => imageSet.id === activeModal.imageSetId)
    : null;
  const activeOptionIndex =
    activeImageSet && activeModal
      ? activeImageSet.options.findIndex((option) => option.id === activeModal.optionId)
      : -1;
  const activeFailedImageSet = activeFailureId
    ? failedImageSets.find((failedImageSet) => failedImageSet.id === activeFailureId)
    : null;

  return (
    <section aria-label="Image results area" className="grid gap-3">
      <div className="grid gap-4">
        {imageSets.map((imageSet, imageSetIndex) => (
          <article
            aria-label={`Image set ${imageSetIndex + 1}`}
            className="grid min-w-0 gap-2 rounded-sm bg-slate-950/45 p-2"
            key={imageSet.id}>
            <p className="font-medium text-slate-200 text-xs">
              {imageSet.selectedImageOriginal.title ?? `Image set ${imageSetIndex + 1}`}
            </p>
            <div className="overflow-x-auto pb-2">
              <ul className="flex w-max gap-2 pr-2">
                {imageSet.options.map((option, optionIndex) => (
                  <li
                    className="w-[min(70vw,18rem)] shrink-0 lg:w-[min(18vw,300px)]"
                    key={option.id}>
                    <div className="group grid w-full gap-1.5 rounded-sm bg-slate-950/40 text-left transition">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-sm bg-slate-900">
                        <button
                          type="button"
                          aria-label={`Open ${option.label} from image set ${imageSetIndex + 1}`}
                          onClick={() =>
                            setActiveModal({
                              imageSetId: imageSet.id,
                              optionId: option.id,
                            })
                          }
                          className="block h-full w-full focus:outline-none focus:ring-2 focus:ring-sky-300/25">
                          <Image
                            alt={option.altText ?? option.label}
                            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
                            height={240}
                            loading={imageSetIndex === 0 && optionIndex === 0 ? "eager" : "lazy"}
                            src={option.url}
                            unoptimized
                            width={320}
                          />
                        </button>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 shadow-lg shadow-black/30 transition group-hover:opacity-100 group-focus-within:opacity-100">
                          <button
                            type="button"
                            aria-label={`Expand ${
                              option.label
                            } from image set ${imageSetIndex + 1}`}
                            onClick={() =>
                              setActiveModal({
                                imageSetId: imageSet.id,
                                optionId: option.id,
                              })
                            }
                            className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-slate-950/80 text-slate-100 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300/25">
                            <Expand aria-hidden className="h-3.5 w-3.5" />
                          </button>
                          <a
                            aria-label={`Download ${
                              option.label
                            } from image set ${imageSetIndex + 1}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-sm bg-slate-950/80 text-slate-100 transition hover:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-300/25"
                            download={buildImageDownloadName(imageSet, option)}
                            href={option.url}>
                            <Download aria-hidden className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                      <span className="px-0.5 text-slate-400 text-xs">{option.label}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </article>
        ))}
        {failedImageSets.map((failedImageSet, failedIndex) => (
          <article
            aria-label={`Failed image set ${failedIndex + 1}`}
            className="grid gap-1 rounded-sm border border-rose-400/20 bg-rose-950/10 p-3"
            key={failedImageSet.id}>
            <p className="font-medium text-rose-100 text-sm">Image set failed</p>
            <p className="text-rose-200/80 text-xs leading-5">
              This image set could not be generated.
            </p>
            <button
              type="button"
              aria-label={`Open Quiet Failure Details for failed image set ${failedIndex + 1}`}
              onClick={() => setActiveFailureId(failedImageSet.id)}
              className="inline-flex h-8 w-fit items-center gap-2 rounded-sm border border-rose-300/20 bg-rose-300/10 px-2.5 text-rose-100 text-xs transition hover:border-rose-200/40 focus:outline-none focus:ring-2 focus:ring-rose-200/20">
              <Eye aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
              Details
            </button>
          </article>
        ))}
      </div>
      {activeFailedImageSet ? (
        <TextRevealModal
          label="Quiet Failure Details"
          title="Quiet Failure Details"
          onClose={() => setActiveFailureId(null)}>
          <FailureDetails
            failure={{
              message: activeFailedImageSet.message,
              failedAt: activeFailedImageSet.failedAt,
            }}
          />
        </TextRevealModal>
      ) : null}
      {activeImageSet && activeOptionIndex >= 0 ? (
        <ImageOptionModal
          imageSet={activeImageSet}
          optionIndex={activeOptionIndex}
          onClose={() => setActiveModal(null)}
          onOptionIndexChange={(optionIndex) =>
            setActiveModal({
              imageSetId: activeImageSet.id,
              optionId: activeImageSet.options[optionIndex]?.id ?? "",
            })
          }
        />
      ) : null}
    </section>
  );
}
