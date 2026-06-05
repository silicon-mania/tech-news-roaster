"use client";

import { type FormEvent, useId, useState } from "react";
import { parseSourceTweetUrl } from "./source-tweet-url";

export type GenerationIntake = {
  sourceTweetUrl: string;
  usersDirection: string;
};

type SubmissionState =
  | { kind: "idle" }
  | { kind: "invalid"; message: string }
  | { kind: "accepted"; sourceTweetUrl: string };

type IntakeWorkspaceProps = {
  onStartGenerationRun?: (intake: GenerationIntake) => void | Promise<void>;
};

export function IntakeWorkspace({
  onStartGenerationRun,
}: IntakeWorkspaceProps) {
  const sourceTweetUrlId = useId();
  const usersDirectionId = useId();
  const sourceTweetUrlHelpId = `${sourceTweetUrlId}-help`;
  const sourceTweetUrlErrorId = `${sourceTweetUrlId}-error`;
  const [sourceTweetUrl, setSourceTweetUrl] = useState("");
  const [usersDirection, setUsersDirection] = useState("");
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    kind: "idle",
  });

  function submitIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const parsedSourceTweetUrl = parseSourceTweetUrl(sourceTweetUrl);

    if (!parsedSourceTweetUrl.success) {
      setSubmissionState({
        kind: "invalid",
        message: parsedSourceTweetUrl.message,
      });
      return;
    }

    const intake = {
      sourceTweetUrl: parsedSourceTweetUrl.url,
      usersDirection: usersDirection.trim(),
    };

    setSubmissionState({
      kind: "accepted",
      sourceTweetUrl: parsedSourceTweetUrl.url,
    });

    void onStartGenerationRun?.(intake);
  }

  const sourceTweetUrlDescription =
    submissionState.kind === "invalid"
      ? `${sourceTweetUrlHelpId} ${sourceTweetUrlErrorId}`
      : sourceTweetUrlHelpId;

  return (
    <main className="min-h-screen px-5 py-5 text-slate-100 sm:px-8 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-6xl grid-rows-[auto_1fr] gap-6">
        <header className="flex flex-col justify-between gap-3 border-slate-800 border-b pb-5 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 font-medium text-sky-300 text-sm">
              Source Tweet intake
            </p>
            <h1 className="font-semibold text-3xl tracking-normal sm:text-4xl">
              Tech News Roaster
            </h1>
          </div>
          <p className="max-w-sm text-slate-400 text-sm">
            One Source Tweet, one freeform steer, three drafts next.
          </p>
        </header>

        <section className="grid content-center gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-center">
          <form
            noValidate
            onSubmit={submitIntake}
            className="rounded-lg border border-slate-800 bg-slate-950/76 p-5 shadow-2xl shadow-black/25 sm:p-7"
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
                  onChange={(event) => {
                    setSourceTweetUrl(event.target.value);
                    if (submissionState.kind !== "idle") {
                      setSubmissionState({ kind: "idle" });
                    }
                  }}
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
                  onChange={(event) => {
                    setUsersDirection(event.target.value);
                    if (submissionState.kind === "accepted") {
                      setSubmissionState({ kind: "idle" });
                    }
                  }}
                  placeholder="Add context to respect, a constraint, or a line you want challenged."
                  className="min-h-32 w-full resize-y rounded-md border border-slate-700 bg-slate-900 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/25"
                />
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="submit"
                  className="inline-flex min-h-12 items-center justify-center rounded-md bg-sky-300 px-5 font-semibold text-slate-950 transition hover:bg-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-300 focus:ring-offset-2 focus:ring-offset-slate-950"
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
              </div>
            </div>
          </form>

          <aside className="rounded-lg border border-slate-800 bg-slate-950/60 p-5">
            <p className="font-medium text-slate-300 text-sm">Active Run</p>
            <p className="mt-3 text-slate-500 text-sm">
              Waiting for a Source Tweet.
            </p>
            {submissionState.kind === "accepted" ? (
              <p className="mt-5 break-all rounded-md border border-emerald-400/30 bg-emerald-400/10 p-3 text-emerald-100 text-sm">
                {submissionState.sourceTweetUrl}
              </p>
            ) : null}
          </aside>
        </section>
      </div>
    </main>
  );
}
