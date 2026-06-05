import { draftTarget } from "@/features/generation/generation-events";
import type { GenerationRun } from "../types";
import { DraftComparison } from "./draft-comparison";
import { RunStatusBadge } from "./run-status-badge";

type ActiveRunPanelProps = {
  activeRun: GenerationRun | null;
};

export function ActiveRunPanel({ activeRun }: ActiveRunPanelProps) {
  return (
    <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-black/20 sm:p-6">
      <div className="flex flex-col justify-between gap-3 border-slate-800 border-b pb-4 sm:flex-row sm:items-center">
        <div>
          <p className="font-medium text-slate-300 text-sm">Active Run</p>
          <h2 className="mt-1 font-semibold text-2xl text-slate-100 tracking-normal">
            {activeRun?.label ?? "Waiting for a Source Tweet"}
          </h2>
        </div>
        {activeRun ? <RunStatusBadge status={activeRun.status} /> : null}
      </div>

      {activeRun ? <RunDetails run={activeRun} /> : <EmptyActiveRun />}
    </section>
  );
}

function EmptyActiveRun() {
  return (
    <p className="mt-5 text-slate-500 text-sm">
      Start a run to track generation progress here.
    </p>
  );
}

function RunDetails({ run }: { run: GenerationRun }) {
  return (
    <div className="mt-5 grid gap-5">
      <GenerationProgress run={run} />

      {run.status === "completed" && run.drafts.length === draftTarget ? (
        <DraftComparison drafts={run.drafts} />
      ) : null}

      <RunContext run={run} />
    </div>
  );
}

function GenerationProgress({ run }: { run: GenerationRun }) {
  return (
    <div className="rounded-md border border-slate-800 bg-slate-900/55 p-4">
      <p className="font-medium text-slate-300 text-sm">Generation progress</p>
      <p className="mt-2 text-slate-500 text-sm">
        Tracking provider drafts as they arrive.
      </p>
      <p className="mt-4 font-semibold text-3xl text-slate-100">
        {run.draftCount}/{run.draftTarget}
      </p>
    </div>
  );
}

function RunContext({ run }: { run: GenerationRun }) {
  return (
    <div className="grid gap-3">
      <div>
        <p className="font-medium text-slate-300 text-sm">Source Tweet</p>
        <p className="mt-2 break-all rounded-md border border-slate-800 bg-slate-900/55 p-3 text-slate-300 text-sm">
          {run.sourceTweetUrl}
        </p>
      </div>

      {run.usersDirection ? (
        <div>
          <p className="font-medium text-slate-300 text-sm">
            User&apos;s Direction
          </p>
          <p className="mt-2 whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-900/55 p-3 text-slate-300 text-sm">
            {run.usersDirection}
          </p>
        </div>
      ) : null}
    </div>
  );
}
