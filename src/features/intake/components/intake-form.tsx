import { type FormEvent, useId } from "react";
import type { SubmissionState } from "../types";

type IntakeFormProps = {
  hasRunningRun: boolean;
  hasRuns: boolean;
  hasUsersDirection: boolean;
  runsCount: number;
  sourceTweetUrl: string;
  submissionState: SubmissionState;
  onOpenDirectionPanel: () => void;
  onOpenRunsDrawer: () => void;
  onSourceTweetUrlChange: (sourceTweetUrl: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

export function IntakeForm({
  hasRunningRun,
  hasRuns,
  hasUsersDirection,
  runsCount,
  sourceTweetUrl,
  submissionState,
  onOpenDirectionPanel,
  onOpenRunsDrawer,
  onSourceTweetUrlChange,
  onSubmit,
}: IntakeFormProps) {
  const sourceTweetUrlId = useId();
  const sourceTweetUrlErrorId = `${sourceTweetUrlId}-error`;
  const statusId = `${sourceTweetUrlId}-status`;
  const sourceTweetUrlDescription = [
    submissionState.kind === "invalid" ? sourceTweetUrlErrorId : null,
    submissionState.kind === "accepted" || submissionState.kind === "blocked"
      ? statusId
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section
      aria-label={hasRuns ? "Compressed intake bar" : "Primary intake bar"}
      className={`mx-auto grid w-full max-w-3xl gap-3 transition-[max-width] duration-300 ${
        hasRuns ? "sm:max-w-2xl" : ""
      }`}
    >
      <form
        noValidate
        onSubmit={onSubmit}
        className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto_2.75rem] items-center gap-2 rounded-lg border border-slate-800 bg-slate-950/82 p-2 shadow-2xl shadow-black/25 sm:grid-cols-[3rem_minmax(0,1fr)_auto_3rem]"
      >
        <button
          type="button"
          aria-label={`Open runs drawer, ${runsCount} runs`}
          onClick={onOpenRunsDrawer}
          className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition hover:border-slate-600 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
        >
          <RunsIcon />
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
            className="h-11 w-full min-w-0 rounded-md border border-transparent bg-slate-900/80 px-3 text-base text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-sky-400 focus:ring-2 focus:ring-sky-400/25 aria-invalid:border-rose-400 aria-invalid:focus:border-rose-400 aria-invalid:focus:ring-rose-400/25 sm:px-4"
          />
        </div>

        <button
          type="submit"
          disabled={hasRunningRun}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-sky-300 px-3 font-semibold text-slate-950 text-sm transition hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 sm:px-4"
        >
          <RunIcon />
          <span>Run</span>
        </button>

        <button
          type="button"
          aria-label="Open user's direction panel"
          onClick={onOpenDirectionPanel}
          className="relative inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-800 text-slate-400 transition hover:border-slate-600 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-400/25"
        >
          <DirectionIcon />
          {hasUsersDirection ? (
            <span
              title="User's Direction has content"
              className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-sky-300"
            />
          ) : null}
        </button>
      </form>

      <div className="min-h-5 px-2">
        {submissionState.kind === "invalid" ? (
          <p
            id={sourceTweetUrlErrorId}
            role="alert"
            className="text-center text-rose-300 text-sm"
          >
            {submissionState.message}
          </p>
        ) : null}
        {submissionState.kind === "accepted" ? (
          <p
            id={statusId}
            role="status"
            aria-live="polite"
            className="text-center text-emerald-300 text-sm"
          >
            Intake accepted.
          </p>
        ) : null}
        {submissionState.kind === "blocked" ? (
          <p
            id={statusId}
            role="status"
            className="text-center text-slate-400 text-sm"
          >
            {submissionState.message}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function RunsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      <path d="M5 7h14" />
      <path d="M5 12h14" />
      <path d="M5 17h14" />
    </svg>
  );
}

function DirectionIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.7"
    >
      <path d="M5 6h14" />
      <path d="M5 12h9" />
      <path d="M5 18h6" />
    </svg>
  );
}

function RunIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
    >
      <path d="M5 12h13" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}
