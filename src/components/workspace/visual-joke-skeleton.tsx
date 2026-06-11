import { Skeleton } from "@/components/ui/skeleton";

const SKELETON_JOKE_COUNT = 3;

export function VisualJokeSkeleton() {
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h1 className="title-serif text-2xl text-foreground md:text-3xl">Visual jokes</h1>
      </div>
      <section
        aria-busy="true"
        aria-label="Visual Joke Creative Result Area"
        className="grid gap-2">
        <ul className="grid gap-2">
          {Array.from({ length: SKELETON_JOKE_COUNT }, (_, index) => (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity beyond position
              key={`visual-joke-skeleton-${index}`}>
              <div className="grid gap-3 rounded-md bg-card/70 p-3">
                <div className="grid gap-2">
                  <Skeleton className="h-3.5 w-[92%]" />
                  <Skeleton className="h-3.5 w-[64%]" />
                </div>
                <div className="flex items-center gap-3">
                  <Skeleton className="size-3.5 rounded-md" />
                  <div className="flex items-center gap-2">
                    <Skeleton className="size-3.5 rounded-full" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
