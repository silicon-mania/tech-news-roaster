"use client";

import { Skeleton } from "@/components/ui/skeleton";

const imageOptionCellClassName = "w-[min(70vw,18rem)] shrink-0 lg:w-[min(18vw,300px)]";
// One Selected Image Original plus its four variations.
const imageSetOptionCount = 5;

/**
 * The pending placeholder set shown at the bottom of the stack while a generation
 * is in flight. It reserves the Image Set article's footprint so the real set
 * lands with no layout shift (skeletons, not spinners).
 */
export function PendingImageSet() {
  return (
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
  );
}
