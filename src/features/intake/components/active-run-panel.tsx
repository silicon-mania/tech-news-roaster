import type { GenerationRun } from "../types";
import { DraftComparison } from "./draft-comparison";

type ActiveRunPanelProps = {
  activeRun: GenerationRun | null;
  onDraftTextChange: (draftId: string, text: string) => void;
};

export function ActiveRunPanel({
  activeRun,
  onDraftTextChange,
}: ActiveRunPanelProps) {
  if (!activeRun) {
    return (
      <section
        aria-label="Empty draft canvas"
        className="min-h-[18rem] sm:min-h-[22rem]"
      />
    );
  }

  const sourceTweetPreview = activeRun.sourceTweet ? (
    <SourceTweetPreview text={activeRun.sourceTweet.text} />
  ) : null;

  if (activeRun.status === "running") {
    return (
      <section className="mx-auto grid w-full max-w-5xl gap-3 self-start">
        {sourceTweetPreview}
        <GenerationWaitingState run={activeRun} />
      </section>
    );
  }

  if (activeRun.status === "failed") {
    return (
      <section className="mx-auto grid w-full max-w-5xl gap-3 self-start">
        {sourceTweetPreview}
        <GenerationFailureState run={activeRun} />
      </section>
    );
  }

  return (
    <section
      aria-label="Completed draft canvas"
      className="mx-auto grid w-full max-w-5xl gap-3 self-start"
    >
      {sourceTweetPreview}
      <DraftComparison
        drafts={activeRun.drafts}
        onDraftTextChange={onDraftTextChange}
      />
    </section>
  );
}

function SourceTweetPreview({ text }: { text: string }) {
  return (
    <aside
      aria-label="Source Tweet Preview"
      className="sticky top-3 z-10 rounded-sm border border-slate-800/80 bg-slate-950/88 px-3 py-2 shadow-lg shadow-black/20 backdrop-blur"
    >
      <p className="line-clamp-2 text-slate-400 text-sm leading-6">{text}</p>
    </aside>
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

function GenerationFailureState({ run }: { run: GenerationRun }) {
  return (
    <section
      aria-label="Generation failure state"
      aria-live="polite"
      className="grid min-h-[20rem] place-items-center sm:min-h-[24rem]"
    >
      <p className="max-w-sm text-center text-rose-200 text-sm leading-6">
        {run.failureMessage ?? "Source tweet could not be retrieved."}
      </p>
    </section>
  );
}
