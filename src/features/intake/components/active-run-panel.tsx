import type { GenerationRun } from "../types";
import { DraftComparison } from "./draft-comparison";

type ActiveRunPanelProps = {
  activeRun: GenerationRun | null;
};

export function ActiveRunPanel({ activeRun }: ActiveRunPanelProps) {
  if (!activeRun) {
    return (
      <section
        aria-label="Empty draft canvas"
        className="min-h-[18rem] sm:min-h-[22rem]"
      />
    );
  }

  if (activeRun.status === "running") {
    return <GenerationWaitingState run={activeRun} />;
  }

  return (
    <section
      aria-label="Completed draft canvas"
      className="mx-auto w-full max-w-5xl self-start"
    >
      <DraftComparison drafts={activeRun.drafts} />
    </section>
  );
}

function GenerationWaitingState({ run }: { run: GenerationRun }) {
  return (
    <section
      aria-label="Generation waiting state"
      aria-live="polite"
      className="grid min-h-[20rem] place-items-center sm:min-h-[24rem]"
    >
      <div className="grid justify-items-center gap-3 text-center">
        <p className="font-semibold text-5xl text-slate-100 tracking-normal sm:text-6xl">
          {run.draftCount}/{run.draftTarget}
        </p>
        <p className="text-slate-500 text-sm">drafts</p>
      </div>
    </section>
  );
}
