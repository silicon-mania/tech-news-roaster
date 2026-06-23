import { Skeleton } from "@/components/ui/skeleton";
import type { GenerationRun } from "@/services/workspace";

/**
 * The News Category line in Generation Progress (ADR-0027 / issue 004). The
 * classifier runs after Joke Context Gathering, in parallel with Text Generation,
 * and its result only lands in the run autosaved on completion — so while the run
 * is in flight this line simply shows the step running, alongside context
 * gathering, text generation, and image generation. Once the run settles, the
 * chosen stamp lives on the Final Quote Tweet Image (and, later, the editable
 * News Category section), so the progress line retires.
 */
export function NewsCategoryProgress({ run }: { run: GenerationRun }) {
  if (run.status !== "running") {
    return null;
  }

  return (
    <section
      aria-busy="true"
      aria-label="News Category selecting"
      className="flex items-center gap-2 text-muted-foreground text-xs">
      <span className="font-medium text-foreground/80">News Category</span>
      <Skeleton className="h-3 w-20" />
    </section>
  );
}
