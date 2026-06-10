import { useEffect, useState } from "react";
import type { GenerationRun } from "@/services/workspace";
import { getRunPhaseLabel } from "@/services/workspace";

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
        <h2 className="editorial-serif text-slate-100 text-xl">Runs</h2>
        <span className="text-slate-500 text-xs">{runs.length}</span>
      </div>

      {runs.length === 0 ? (
        <p className="text-slate-500 text-sm leading-6">No runs yet.</p>
      ) : (
        <ul className="grid gap-1.5">
          {runs.map((run) => {
            const phaseLabel = getRunPhaseLabel(run);

            return (
              <li key={run.id} className="group relative">
                <button
                  type="button"
                  onClick={() => onSelectRun(run.id)}
                  aria-current={run.id === activeRunId ? "true" : undefined}
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sm border border-transparent bg-transparent p-3 text-left transition hover:border-slate-800 hover:bg-slate-900/55 focus:outline-none focus:ring-2 focus:ring-sky-300/20 aria-current:border-sky-300/40 aria-current:bg-sky-300/8 sm:pr-10">
                  <span className="grid min-w-0 gap-1">
                    <span className="truncate font-medium text-slate-100 text-sm leading-5">
                      {run.label}
                    </span>
                    <span className="truncate text-slate-500 text-xs">
                      {formatRelativeDate(run.savedAt)}
                    </span>
                    <span className="truncate text-slate-400 text-xs">{phaseLabel}</span>
                  </span>
                  <span
                    aria-hidden="true"
                    title={phaseLabel}
                    className={`h-1.5 w-1.5 rounded-full ${getStatusDotClass(run)}`}
                  />
                </button>
                {isDesktop && run.status === "completed" ? (
                  <button
                    type="button"
                    aria-label={`Delete saved run: ${run.label}`}
                    onClick={() => onDeleteRun(run.id)}
                    className="-translate-y-1/2 absolute top-1/2 right-2 inline-flex h-8 w-8 items-center justify-center rounded-sm border border-transparent text-slate-500 opacity-0 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-rose-300/25 group-hover:opacity-100">
                    <TrashIcon />
                  </button>
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
    return "bg-sky-300";
  }

  if (run.phase === "failed" || run.status === "failed") {
    return "bg-rose-400/70";
  }

  if (run.phase === "image-generation-partially-failed") {
    return "bg-amber-300/80";
  }

  if (run.phase === "waiting-for-image-selection") {
    return "bg-violet-300/80";
  }

  return "bg-slate-700";
}

function formatRelativeDate(savedAt: string | undefined) {
  if (!savedAt) {
    return "just now";
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(savedAt)) / 1000));
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const elapsedDays = Math.floor(elapsedHours / 24);
  const elapsedWeeks = Math.floor(elapsedDays / 7);

  if (elapsedMinutes < 1) {
    return "just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} ${pluralize("minute", elapsedMinutes)} ago`;
  }

  if (elapsedHours < 24) {
    return `${elapsedHours} ${pluralize("hour", elapsedHours)} ago`;
  }

  if (elapsedDays < 14) {
    return `${elapsedDays} ${pluralize("day", elapsedDays)} ago`;
  }

  return `${elapsedWeeks} ${pluralize("week", elapsedWeeks)} ago`;
}

function pluralize(unit: string, count: number) {
  return count === 1 ? unit : `${unit}s`;
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.3">
      <path d="M4 7h16" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </svg>
  );
}
