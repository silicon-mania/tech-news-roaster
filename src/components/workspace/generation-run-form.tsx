import { AlignLeft, ArrowRight, Menu } from "lucide-react";
import { type FormEvent, useId } from "react";
import type { SubmissionState } from "@/services/workspace";

const iconButtonClassName =
  "inline-flex items-center justify-center rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300/20";

type GenerationRunFormProps = {
  hasRuns: boolean;
  hasUsersDirection: boolean;
  isRunDisabled: boolean;
  runtimeNotice?: {
    kind: "blocked" | "warning";
    message: string;
  };
  runsCount: number;
  sourceTweetUrl: string;
  submissionState: SubmissionState;
  onOpenDirectionPanel: () => void;
  onOpenRunsDrawer: () => void;
  onSourceTweetUrlChange: (sourceTweetUrl: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function GenerationRunForm({
  hasRuns,
  hasUsersDirection,
  isRunDisabled,
  runtimeNotice,
  runsCount,
  sourceTweetUrl,
  submissionState,
  onOpenDirectionPanel,
  onOpenRunsDrawer,
  onSourceTweetUrlChange,
  onSubmit,
}: GenerationRunFormProps) {
  const sourceTweetUrlId = useId();
  const sourceTweetUrlErrorId = `${sourceTweetUrlId}-error`;
  const statusId = `${sourceTweetUrlId}-status`;
  const runtimeNoticeId = `${sourceTweetUrlId}-runtime-notice`;
  const visibleRuntimeNotice = submissionState.kind === "idle" ? runtimeNotice : undefined;
  const sourceTweetUrlDescription = [
    submissionState.kind === "invalid" ? sourceTweetUrlErrorId : null,
    submissionState.kind === "accepted" || submissionState.kind === "blocked" ? statusId : null,
    visibleRuntimeNotice ? runtimeNoticeId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      aria-label={hasRuns ? "Compressed source tweet bar" : "Primary source tweet bar"}
      className={`mx-auto grid w-full max-w-3xl gap-3 transition-[max-width] duration-300 ${
        hasRuns ? "sm:max-w-2xl" : ""
      }`}>
      <form
        noValidate
        onSubmit={onSubmit}
        className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-2 rounded-sm border border-slate-800/90 bg-slate-950/84 p-2 shadow-2xl shadow-black/25 backdrop-blur sm:grid-cols-[3rem_minmax(0,1fr)_auto_3rem]">
        <button
          type="button"
          aria-label={`Open runs drawer, ${runsCount} runs`}
          onClick={onOpenRunsDrawer}
          className={iconButtonClassName}>
          <Menu aria-hidden className="size-3.5" strokeWidth={1.75} />
        </button>

        <div className="min-w-0">
          <label htmlFor={sourceTweetUrlId} className="sr-only">
            Source Tweet URL
          </label>
          <input
            id={sourceTweetUrlId}
            name="sourceTweetUrl"
            value={sourceTweetUrl}
            onChange={(event) => onSourceTweetUrlChange(event.target.value)}
            aria-describedby={sourceTweetUrlDescription || undefined}
            aria-invalid={submissionState.kind === "invalid"}
            placeholder="https://x.com/handle/status/1234567890"
            className="h-11 w-full min-w-0 rounded-sm border border-transparent bg-slate-900/70 px-3 text-base text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-300/70 focus:ring-2 focus:ring-sky-300/20 aria-invalid:border-rose-400 aria-invalid:focus:border-rose-400 aria-invalid:focus:ring-rose-400/25 sm:px-4"
          />
        </div>

        <button
          type="submit"
          aria-describedby={visibleRuntimeNotice ? runtimeNoticeId : undefined}
          disabled={isRunDisabled}
          className="col-span-3 row-start-2 inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-sky-300 px-3 font-semibold text-slate-950 text-sm transition hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 sm:col-auto sm:row-auto sm:px-4">
          <ArrowRight aria-hidden className="size-4" strokeWidth={1.75} />
          <span>Run</span>
        </button>

        <button
          type="button"
          aria-label="Open user's direction panel"
          onClick={onOpenDirectionPanel}
          className={`relative col-start-3 row-start-1 sm:col-auto sm:row-auto ${iconButtonClassName}`}>
          <AlignLeft aria-hidden className="size-3.5" strokeWidth={1.75} />
          {hasUsersDirection ? (
            <span
              title="User's Direction has content"
              className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-sky-300"
            />
          ) : null}
        </button>
      </form>

      <div className="min-h-5 px-2">
        {submissionState.kind === "invalid" ? (
          <p
            id={sourceTweetUrlErrorId}
            role="alert"
            className="text-center text-rose-300 text-sm leading-5">
            {submissionState.message}
          </p>
        ) : null}
        {submissionState.kind === "accepted" ? (
          <p
            id={statusId}
            role="status"
            aria-live="polite"
            className="text-center text-emerald-300 text-sm leading-5">
            Run started.
          </p>
        ) : null}
        {submissionState.kind === "blocked" ? (
          <p id={statusId} role="status" className="text-center text-slate-400 text-sm leading-5">
            {submissionState.message}
          </p>
        ) : null}
        {visibleRuntimeNotice ? (
          <p
            id={runtimeNoticeId}
            role={visibleRuntimeNotice.kind === "blocked" ? "status" : undefined}
            className={`text-center text-sm leading-5 ${
              visibleRuntimeNotice.kind === "warning" ? "text-amber-200" : "text-slate-400"
            }`}>
            {visibleRuntimeNotice.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}
