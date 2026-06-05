import { type FormEvent, useId } from "react";
import type { SubmissionState } from "../types";

type IntakeFormProps = {
  hasRunningRun: boolean;
  sourceTweetUrl: string;
  submissionState: SubmissionState;
  usersDirection: string;
  onSourceTweetUrlChange: (sourceTweetUrl: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUsersDirectionChange: (usersDirection: string) => void;
};

export function IntakeForm({
  hasRunningRun,
  sourceTweetUrl,
  submissionState,
  usersDirection,
  onSourceTweetUrlChange,
  onSubmit,
  onUsersDirectionChange,
}: IntakeFormProps) {
  const sourceTweetUrlId = useId();
  const usersDirectionId = useId();
  const sourceTweetUrlHelpId = `${sourceTweetUrlId}-help`;
  const sourceTweetUrlErrorId = `${sourceTweetUrlId}-error`;
  const sourceTweetUrlDescription =
    submissionState.kind === "invalid"
      ? `${sourceTweetUrlHelpId} ${sourceTweetUrlErrorId}`
      : sourceTweetUrlHelpId;

  return (
    <form
      noValidate
      onSubmit={onSubmit}
      className="rounded-lg border border-slate-800 bg-slate-950/76 p-5 shadow-2xl shadow-black/25 sm:p-6 lg:col-span-2 xl:col-span-1"
    >
      <div className="grid gap-5">
        <div className="grid gap-2">
          <label
            htmlFor={sourceTweetUrlId}
            className="font-medium text-slate-200 text-sm"
          >
            Source Tweet URL
          </label>
          <input
            id={sourceTweetUrlId}
            name="sourceTweetUrl"
            value={sourceTweetUrl}
            onChange={(event) => onSourceTweetUrlChange(event.target.value)}
            aria-describedby={sourceTweetUrlDescription}
            aria-invalid={submissionState.kind === "invalid"}
            placeholder="https://x.com/handle/status/1234567890"
            className="min-h-12 w-full rounded-md border border-slate-700 bg-slate-900 px-4 text-base text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/25 aria-invalid:border-rose-400 aria-invalid:focus:border-rose-400 aria-invalid:focus:ring-rose-400/25"
          />
          <p id={sourceTweetUrlHelpId} className="text-slate-400 text-sm">
            Direct x.com or twitter.com status links only.
          </p>
          {submissionState.kind === "invalid" ? (
            <p
              id={sourceTweetUrlErrorId}
              role="alert"
              className="text-rose-300 text-sm"
            >
              {submissionState.message}
            </p>
          ) : null}
        </div>

        <div className="grid gap-2">
          <label
            htmlFor={usersDirectionId}
            className="font-medium text-slate-200 text-sm"
          >
            User&apos;s Direction{" "}
            <span className="text-slate-500">(optional)</span>
          </label>
          <textarea
            id={usersDirectionId}
            name="usersDirection"
            value={usersDirection}
            onChange={(event) => onUsersDirectionChange(event.target.value)}
            placeholder="Add context to respect, a constraint, or a line you want challenged."
            className="min-h-32 w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/25"
          />
        </div>

        <div className="grid gap-3">
          <button
            type="submit"
            disabled={hasRunningRun}
            className="inline-flex min-h-12 items-center justify-center rounded-md bg-sky-300 px-5 font-semibold text-slate-950 transition hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
          >
            Generate drafts
          </button>
          {submissionState.kind === "accepted" ? (
            <p
              role="status"
              className="text-emerald-300 text-sm"
              aria-live="polite"
            >
              Intake accepted.
            </p>
          ) : null}
          {submissionState.kind === "blocked" ? (
            <p role="status" className="text-slate-400 text-sm">
              {submissionState.message}
            </p>
          ) : null}
        </div>
      </div>
    </form>
  );
}
