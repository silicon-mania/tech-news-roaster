import type { GenerationRun } from "../types";
import { RunStatusBadge } from "./run-status-badge";

type RunsListProps = {
  activeRunId: string | null;
  runs: GenerationRun[];
  onSelectRun: (runId: string) => void;
};

export function RunsList({ activeRunId, runs, onSelectRun }: RunsListProps) {
  return (
    <aside
      aria-label="Unified runs list"
      className="rounded-lg border border-slate-800 bg-slate-950/60 p-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-medium text-slate-200 text-sm">Runs</h2>
        <span className="text-slate-500 text-xs">{runs.length}</span>
      </div>

      {runs.length === 0 ? (
        <p className="mt-4 text-slate-500 text-sm">No runs yet.</p>
      ) : (
        <ul className="mt-4 grid gap-2">
          {runs.map((run) => (
            <li key={run.id}>
              <button
                type="button"
                onClick={() => onSelectRun(run.id)}
                aria-current={run.id === activeRunId ? "true" : undefined}
                className="grid w-full gap-2 rounded-md border border-slate-800 bg-slate-900/70 p-3 text-left transition hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-400/30 aria-current:border-sky-400/70 aria-current:bg-sky-400/10"
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
    </aside>
  );
}
