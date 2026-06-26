import { Skeleton } from "@/components/ui/skeleton";

/**
 * The single loading state a Manual Run shows while the server composes it. The
 * manual path composes and persists in one batch request rather than streaming, so
 * there are no intermediate per-phase result-states to reveal — the workspace
 * holds one quiet "composing" footprint until the finished run (or its failure)
 * replaces the placeholder.
 */
export function RunComposingState() {
  return (
    <section
      aria-busy="true"
      aria-label="Composing generation run"
      className="mx-auto grid w-full max-w-5xl gap-5 self-start">
      <p className="text-muted-foreground text-sm leading-6">Composing…</p>
      <div className="grid gap-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-[94%]" />
        <Skeleton className="h-4 w-[88%]" />
        <Skeleton className="h-4 w-[60%]" />
      </div>
    </section>
  );
}
