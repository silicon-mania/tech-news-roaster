import { Skeleton } from "@/components/ui/skeleton";

// Reserve the three Visual Joke Sections so the sectioned layout does not shift
// when the set arrives. Two joke placeholders per section keep the footprint
// close to a typical loaded section without overstating it.
const SKELETON_SECTION_COUNT = 3;
const SKELETON_JOKES_PER_SECTION = 2;

export function VisualJokeSkeleton() {
  return (
    <>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h1 className="title-serif text-2xl text-foreground md:text-3xl">Visual jokes</h1>
      </div>
      <section
        aria-busy="true"
        aria-label="Visual Joke Creative Result Area"
        className="grid gap-6">
        {Array.from({ length: SKELETON_SECTION_COUNT }, (_, sectionIndex) => (
          <div
            className="grid gap-2"
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity beyond position
            key={`visual-joke-skeleton-section-${sectionIndex}`}>
            <Skeleton className="h-3 w-20" />
            <ul className="grid gap-2">
              {Array.from({ length: SKELETON_JOKES_PER_SECTION }, (_, jokeIndex) => (
                <li
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity beyond position
                  key={`visual-joke-skeleton-${sectionIndex}-${jokeIndex}`}>
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
          </div>
        ))}
      </section>
    </>
  );
}
