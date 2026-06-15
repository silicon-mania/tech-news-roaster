import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_COLLAPSED_DRAFT_COUNT = 2;

/**
 * Loading placeholder for the Text generation section. Mirrors the footprint of
 * {@link DraftComparison} — one expanded draft card followed by collapsed cards —
 * so the layout does not shift when the real draft stack arrives.
 */
export function TextGenerationSkeleton() {
  return (
    <section aria-busy="true" aria-label="Text generation loading">
      <div className="grid gap-3">
        <article className="grid gap-5 rounded-lg bg-secondary/55 px-1 py-1 sm:px-2">
          <div className="flex items-center justify-between gap-3 px-2 pt-2">
            <div className="flex min-w-0 items-center gap-2">
              <Skeleton className="size-6 shrink-0 rounded-md" />
              <Skeleton className="h-3 w-28" />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          </div>
          <div className="grid gap-2.5 px-2 pb-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-[97%]" />
            <Skeleton className="h-4 w-[90%]" />
            <Skeleton className="h-4 w-[62%]" />
          </div>
        </article>
        {Array.from({ length: SKELETON_COLLAPSED_DRAFT_COUNT }, (_, index) => (
          <article
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity beyond position
            key={`text-generation-skeleton-${index}`}
            className="rounded-lg bg-secondary/55 opacity-60">
            <div className="grid gap-3 p-3 sm:p-4">
              <div className="grid gap-2">
                <Skeleton className="h-3.5 w-[92%]" />
                <Skeleton className="h-3.5 w-[80%]" />
                <Skeleton className="h-3.5 w-[55%]" />
              </div>
              <div className="flex min-w-0 items-center gap-2">
                <Skeleton className="size-6 shrink-0 rounded-md" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
