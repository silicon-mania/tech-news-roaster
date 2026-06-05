import type { GenerationRun } from "../types";
import { RunStatusBadge } from "./run-status-badge";

type RunsListProps = {
  activeRunId: string | null;
  runs: GenerationRun[];
  onSelectRun: (runId: string) => void;
};

export function RunsList({ activeRunId, runs, onSelectRun }: RunsListProps) {
  return (
    <section aria-label="Unified runs list" className="grid gap-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium text-slate-200 text-sm">Runs</h2>
        <span className="text-slate-500 text-xs">{runs.length}</span>
      </div>

      {runs.length === 0 ? (
        <p className="text-slate-500 text-sm">No runs yet.</p>
      ) : (
        <ul className="grid gap-1.5">
          {runs.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => onSelectRun(run.id)}
                aria-current={run.id === activeRunId ? "true" : undefined}
                className="grid w-full gap-1 rounded-md border border-transparent bg-transparent p-3 text-left transition hover:border-slate-800 hover:bg-slate-900/55 focus:outline-none focus:ring-2 focus:ring-sky-400/25 aria-current:border-sky-400/40 aria-current:bg-sky-400/8"
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="truncate font-medium text-slate-100 text-sm">
                    {run.label}
                  </span>
                  <RunStatusBadge compact status={run.status} />
                </span>
                <span className="text-slate-400 text-xs">
                  {run.draftCount}/{run.draftTarget} drafts
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
