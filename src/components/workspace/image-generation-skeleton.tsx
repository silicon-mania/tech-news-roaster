import { Skeleton } from "@/components/ui/skeleton";
import { SectionHeader } from "./section-header";

const SKELETON_IMAGE_COUNT = 3;

/**
 * Loading placeholder for the Image generation section. Mirrors the footprint of
 * {@link ImageGenerationArea}'s news-linked image picker — the section header, a
 * status row, a horizontal strip of source-image cards, and the start action — so
 * the layout does not shift when image discovery completes.
 */
export function ImageGenerationSkeleton() {
  return (
    <>
      <SectionHeader title="Image generation" />
      <aside
        aria-busy="true"
        aria-label="Image generation loading"
        className="grid gap-3 bg-card/40 p-3">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="overflow-x-auto pb-2">
          <ul className="flex w-max gap-2 pr-2">
            {Array.from({ length: SKELETON_IMAGE_COUNT }, (_, index) => (
              <li
                // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity beyond position
                key={`image-generation-skeleton-${index}`}
                className="w-[min(70vw,18rem)] shrink-0 lg:w-[min(18vw,300px)]">
                <div className="grid w-full gap-1.5 rounded-md bg-card/50 p-0.5">
                  <Skeleton className="aspect-[4/3] w-full rounded-md" />
                  <Skeleton className="mt-0.5 h-3 w-2/3" />
                </div>
              </li>
            ))}
          </ul>
        </div>
        <Skeleton className="h-9 w-44 rounded-md" />
      </aside>
    </>
  );
}
