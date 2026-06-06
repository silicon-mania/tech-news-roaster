import Image from "next/image";
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
        className="min-h-72 sm:min-h-88"
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
        fallbackDisclosure={activeRun.fallbackDisclosure}
        onDraftTextChange={onDraftTextChange}
      />
    </section>
  );
}

function SourceTweetPreview({ text }: { text: string }) {
  return (
    <aside
      aria-label="Source Tweet Preview"
      className="top-2 z-10 px-3.5 mb-6 shadow-lg shadow-black/30 backdrop-blur-sm max-w-3xl mx-auto"
    >
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-white/10 bg-slate-950/90 p-1.5">
          <Image
            alt=""
            aria-hidden
            className="h-full w-full object-contain"
            height={28}
            src="/assets/x-light.png"
            width={28}
          />
        </span>
        <div className="grid min-w-0 gap-1">
          <p className="text-xs text-slate-500">Source post</p>
          <p className="line-clamp-2 wrap-break-word text-slate-200 text-sm leading-6">
            {text}
          </p>
        </div>
      </div>
    </aside>
  );
}

function GenerationWaitingState({ run }: { run: GenerationRun }) {
  return (
    <section
      aria-label="Generation waiting state"
      aria-live="polite"
      className="grid min-h-80 place-items-center sm:min-h-96"
    >
      <div className="grid justify-items-center gap-3 text-center">
        <p className="editorial-serif text-6xl text-slate-100 tracking-normal sm:text-7xl">
          {run.draftCount}/{run.draftTarget}
        </p>
        <p className="text-slate-500 text-xs uppercase tracking-[0.18em]">
          drafts
        </p>
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
