"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import {
  draftTarget,
  parseGenerationStreamEvent,
  type QuoteTweetDraft,
} from "@/features/generation/generation-events";
import { parseSourceTweetUrl } from "./source-tweet-url";

export type GenerationIntake = {
  sourceTweetUrl: string;
  usersDirection: string;
};

export type GenerationRun = {
  id: string;
  label: string;
  sourceTweetUrl: string;
  usersDirection: string;
  status: "running" | "completed";
  draftCount: number;
  draftTarget: number;
  drafts: QuoteTweetDraft[];
};

type GenerationEventListener = (message: MessageEvent<string>) => void;

type GenerationEventSource = {
  addEventListener(
    type: "progress" | "completed",
    listener: GenerationEventListener,
  ): void;
  close(): void;
};

type GenerationEventSourceFactory = (url: string) => GenerationEventSource;

type SubmissionState =
  | { kind: "idle" }
  | { kind: "invalid"; message: string }
  | { kind: "accepted"; sourceTweetUrl: string }
  | { kind: "blocked"; message: string };

type IntakeWorkspaceProps = {
  initialActiveRunId?: string;
  initialRuns?: GenerationRun[];
  generationEventSourceFactory?: GenerationEventSourceFactory;
  onStartGenerationRun?: (intake: GenerationIntake) => void | Promise<void>;
};

const genericRunningRunLabel = "New generation run";

function createGenerationEventSource(url: string) {
  return new EventSource(url);
}

export function IntakeWorkspace({
  generationEventSourceFactory = createGenerationEventSource,
  initialActiveRunId,
  initialRuns = [],
  onStartGenerationRun,
}: IntakeWorkspaceProps) {
  const runSequence = useRef(initialRuns.length);
  const sourceTweetUrlId = useId();
  const usersDirectionId = useId();
  const sourceTweetUrlHelpId = `${sourceTweetUrlId}-help`;
  const sourceTweetUrlErrorId = `${sourceTweetUrlId}-error`;
  const [sourceTweetUrl, setSourceTweetUrl] = useState("");
  const [usersDirection, setUsersDirection] = useState("");
  const [runs, setRuns] = useState<GenerationRun[]>(initialRuns);
  const [activeRunId, setActiveRunId] = useState<string | null>(
    initialActiveRunId ?? initialRuns.at(0)?.id ?? null,
  );
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    kind: "idle",
  });
  const generationEventSources = useRef<Map<string, GenerationEventSource>>(
    new Map(),
  );

  useEffect(() => {
    return () => {
      for (const eventSource of generationEventSources.current.values()) {
        eventSource.close();
      }

      generationEventSources.current.clear();
    };
  }, []);

  const activeRun = runs.find((run) => run.id === activeRunId) ?? null;
  const hasRunningRun = runs.some((run) => run.status === "running");

  function submitIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (hasRunningRun) {
      setSubmissionState({
        kind: "blocked",
        message: "Wait for the running Generation Run to finish first.",
      });
      return;
    }

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

    runSequence.current += 1;
    const runId = `run-${runSequence.current}`;
    const runningRun: GenerationRun = {
      id: runId,
      label: genericRunningRunLabel,
      sourceTweetUrl: parsedSourceTweetUrl.url,
      usersDirection: usersDirection.trim(),
      status: "running",
      draftCount: 0,
      draftTarget,
      drafts: [],
    };

    setRuns((currentRuns) => [runningRun, ...currentRuns]);
    setActiveRunId(runId);
    setSubmissionState({
      kind: "accepted",
      sourceTweetUrl: parsedSourceTweetUrl.url,
    });

    void onStartGenerationRun?.(intake);
    subscribeToGenerationRun(runId, intake);
  }

  function subscribeToGenerationRun(runId: string, intake: GenerationIntake) {
    const eventSource = generationEventSourceFactory(
      buildGenerationStreamUrl(intake),
    );

    generationEventSources.current.set(runId, eventSource);

    eventSource.addEventListener("progress", (message) => {
      const event = parseGenerationStreamEvent(
        JSON.parse((message as MessageEvent<string>).data),
      );

      if (event.type !== "progress") {
        return;
      }

      setRuns((currentRuns) =>
        currentRuns.map((run) => {
          if (run.id !== runId) {
            return run;
          }

          return {
            ...run,
            draftCount: event.draftCount,
            draftTarget: event.draftTarget,
            drafts: [...run.drafts, event.draft],
            label:
              run.label === genericRunningRunLabel ? event.label : run.label,
          };
        }),
      );
    });

    eventSource.addEventListener("completed", (message) => {
      const event = parseGenerationStreamEvent(
        JSON.parse((message as MessageEvent<string>).data),
      );

      if (event.type !== "completed") {
        return;
      }

      setRuns((currentRuns) =>
        currentRuns.map((run) => {
          if (run.id !== runId) {
            return run;
          }

          return {
            ...run,
            status: "completed",
            label: event.run.label,
            draftCount: event.run.drafts.length,
            drafts: event.run.drafts,
          };
        }),
      );

      eventSource.close();
      generationEventSources.current.delete(runId);
    });
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

        <section className="grid content-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_22rem]">
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
                      onClick={() => setActiveRunId(run.id)}
                      aria-current={run.id === activeRunId ? "true" : undefined}
                      className="grid w-full gap-2 rounded-md border border-slate-800 bg-slate-900/70 p-3 text-left transition hover:border-slate-600 focus:outline-none focus:ring-2 focus:ring-sky-400/30 aria-current:border-sky-400/70 aria-current:bg-sky-400/10"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="truncate font-medium text-slate-100 text-sm">
                          {run.label}
                        </span>
                        <span className="inline-flex items-center gap-1.5 text-sky-300 text-xs">
                          <span
                            aria-hidden="true"
                            className="h-2 w-2 rounded-full bg-sky-300"
                          />
                          {run.status === "running" ? "Running" : "Complete"}
                        </span>
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

          <section className="rounded-lg border border-slate-800 bg-slate-950/70 p-5 shadow-2xl shadow-black/20 sm:p-6">
            <div className="flex flex-col justify-between gap-3 border-slate-800 border-b pb-4 sm:flex-row sm:items-center">
              <div>
                <p className="font-medium text-slate-300 text-sm">Active Run</p>
                <h2 className="mt-1 font-semibold text-2xl text-slate-100 tracking-normal">
                  {activeRun?.label ?? "Waiting for a Source Tweet"}
                </h2>
              </div>
              {activeRun ? (
                <span className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-400/30 px-3 py-1 text-sky-200 text-sm">
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 rounded-full bg-sky-300"
                  />
                  {activeRun.status === "running" ? "Running" : "Complete"}
                </span>
              ) : null}
            </div>

            {activeRun ? (
              <div className="mt-5 grid gap-5">
                <div className="rounded-md border border-slate-800 bg-slate-900/55 p-4">
                  <p className="font-medium text-slate-300 text-sm">
                    Generation progress
                  </p>
                  <p className="mt-2 text-slate-500 text-sm">
                    Tracking provider drafts as they arrive.
                  </p>
                  <p className="mt-4 font-semibold text-3xl text-slate-100">
                    {activeRun.draftCount}/{activeRun.draftTarget}
                  </p>
                </div>

                {activeRun.status === "completed" &&
                activeRun.drafts.length === draftTarget ? (
                  <section aria-label="Completed draft comparison">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-slate-300 text-sm">
                        Draft comparison
                      </p>
                      <span className="text-slate-500 text-xs">
                        {activeRun.drafts.length} drafts
                      </span>
                    </div>
                    <div className="mt-3 grid gap-3 xl:grid-cols-3">
                      {activeRun.drafts.map((draft) => (
                        <article
                          key={draft.id}
                          className="grid content-between gap-4 rounded-md border border-slate-800 bg-slate-900/55 p-4"
                        >
                          <p className="whitespace-pre-wrap text-slate-100 text-sm leading-6">
                            {draft.text}
                          </p>
                          <p className="border-slate-800 border-t pt-3 text-slate-400 text-xs">
                            Model Provenance: {draft.modelProvenance}
                          </p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                <div className="grid gap-3">
                  <div>
                    <p className="font-medium text-slate-300 text-sm">
                      Source Tweet
                    </p>
                    <p className="mt-2 break-all rounded-md border border-slate-800 bg-slate-900/55 p-3 text-slate-300 text-sm">
                      {activeRun.sourceTweetUrl}
                    </p>
                  </div>

                  {activeRun.usersDirection ? (
                    <div>
                      <p className="font-medium text-slate-300 text-sm">
                        User&apos;s Direction
                      </p>
                      <p className="mt-2 whitespace-pre-wrap rounded-md border border-slate-800 bg-slate-900/55 p-3 text-slate-300 text-sm">
                        {activeRun.usersDirection}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="mt-5 text-slate-500 text-sm">
                Start a run to track generation progress here.
              </p>
            )}
          </section>

          <form
            noValidate
            onSubmit={submitIntake}
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
        </section>
      </div>
    </main>
  );
}

function buildGenerationStreamUrl(intake: GenerationIntake) {
  const searchParams = new URLSearchParams({
    sourceTweetUrl: intake.sourceTweetUrl,
  });

  if (intake.usersDirection) {
    searchParams.set("usersDirection", intake.usersDirection);
  }

  return `/api/generation-runs/stream?${searchParams.toString()}`;
}
