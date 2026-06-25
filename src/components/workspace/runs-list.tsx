import { Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { GenerationRun } from "@/services/workspace";
import { getRunPhaseLabel } from "@/services/workspace";
import { formatRelativeTime } from "@/utils/relative-time";

type RunsListProps = {
  activeRunId: string | null;
  runs: GenerationRun[];
  onDeleteRun: (runId: string) => void;
  onSelectRun: (runId: string) => void;
};

export function RunsList({ activeRunId, runs, onDeleteRun, onSelectRun }: RunsListProps) {
  const isDesktop = useIsDesktop();

  return (
    <section aria-label="Unified runs list" className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-foreground text-xl">Runs</h2>
        <span className="text-muted-foreground text-xs">{runs.length}</span>
      </div>

      {runs.length === 0 ? (
        <p className="text-muted-foreground text-sm leading-6">No runs yet.</p>
      ) : (
        <ul className="grid gap-1.5">
          {runs.map((run) => {
            const phaseLabel = getRunPhaseLabel(run);
            // A persisted run the operator hasn't opened yet. In-flight runs have
            // no savedAt, so they never read as "unseen"; opening a run persists
            // seenAt and clears the marker (ADR-0019).
            const isUnseen = Boolean(run.savedAt) && !run.seenAt;

            return (
              <li key={run.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelectRun(run.id)}
                  aria-current={run.id === activeRunId ? "true" : undefined}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md bg-transparent p-3 text-left transition hover:bg-secondary/55 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 aria-current:bg-primary/10 aria-current:ring-1 aria-current:ring-primary/35 sm:pr-10">
                  <span className="grid min-w-0 gap-1">
                    <span className="flex min-w-0 items-center gap-2">
                      {isUnseen ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="size-1.5 shrink-0 rounded-full bg-primary"
                          />
                          <span className="sr-only">Unseen</span>
                        </>
                      ) : null}
                      <span className="truncate font-medium text-foreground text-sm leading-5">
                        {run.label}
                      </span>
                    </span>
                    <span className="truncate text-muted-foreground text-xs">
                      {formatRelativeTime(run.savedAt)}
                    </span>
                    <span className="truncate text-muted-foreground/90 text-xs">{phaseLabel}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    title={phaseLabel}
                    className={`h-1.5 w-1.5 rounded-full ${getStatusDotClass(run)}`}
                  />
                </button>
                {isDesktop && run.status === "completed" ? (
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          aria-label={`Delete saved run: ${run.label}`}
                          className="-translate-y-1/2 absolute top-1/2 right-2 text-muted-foreground opacity-0 transition hover:bg-destructive/10 hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                          onClick={() => onDeleteRun(run.id)}
                          size="icon"
                          type="button"
                          variant="ghost"
                        />
                      }>
                      <Trash2 aria-hidden className="size-4" strokeWidth={1.3} />
                    </TooltipTrigger>
                    <TooltipContent>Delete run</TooltipContent>
                  </Tooltip>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("matchMedia" in window)) {
      return;
    }

    const mediaQuery = window.matchMedia("(min-width: 640px)");
    const updateIsDesktop = () => setIsDesktop(mediaQuery.matches);

    updateIsDesktop();
    mediaQuery.addEventListener("change", updateIsDesktop);

    return () => {
      mediaQuery.removeEventListener("change", updateIsDesktop);
    };
  }, []);

  return isDesktop;
}

function getStatusDotClass(run: GenerationRun) {
  if (
    run.phase === "enrichment-running" ||
    run.phase === "text-generation-running" ||
    run.phase === "image-generation-running" ||
    (!run.phase && run.status === "running")
  ) {
    return "bg-primary";
  }

  if (run.phase === "failed" || run.status === "failed") {
    return "bg-destructive/70";
  }

  if (run.phase === "image-generation-failed") {
    return "bg-warning/80";
  }

  if (run.phase === "waiting-for-image-selection") {
    // Needs the operator to pick an image. Decorative blue retired (ADR-0030
    // Phase 5): a dim neutral, distinct from the bright running dot and the muted
    // idle dot — the phase is named in the dot's title, so color stays a hint.
    return "bg-foreground/55";
  }

  return "bg-muted-foreground/40";
}
