"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import {
  draftTarget,
  parseGenerationStreamEvent,
} from "@/features/generation/generation-events";
import {
  ActiveRunPanel,
  IntakeForm,
  RunsList,
  WorkspaceHeader,
} from "./components";
import { parseSourceTweetUrl } from "./source-tweet-url";
import type {
  GenerationEventSource,
  GenerationEventSourceFactory,
  GenerationIntake,
  GenerationRun,
  SubmissionState,
} from "./types";

export type { GenerationIntake, GenerationRun } from "./types";

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
    setSubmissionState({ kind: "accepted" });

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

  function updateSourceTweetUrl(nextSourceTweetUrl: string) {
    setSourceTweetUrl(nextSourceTweetUrl);
    if (submissionState.kind !== "idle") {
      setSubmissionState({ kind: "idle" });
    }
  }

  function updateUsersDirection(nextUsersDirection: string) {
    setUsersDirection(nextUsersDirection);
    if (submissionState.kind === "accepted") {
      setSubmissionState({ kind: "idle" });
    }
  }

  return (
    <main className="min-h-screen px-5 py-5 text-slate-100 sm:px-8 lg:px-10">
      <div className="mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-6xl grid-rows-[auto_1fr] gap-6">
        <WorkspaceHeader />

        <section className="grid content-start gap-5 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_22rem]">
          <RunsList
            activeRunId={activeRunId}
            runs={runs}
            onSelectRun={setActiveRunId}
          />
          <ActiveRunPanel activeRun={activeRun} />
          <IntakeForm
            hasRunningRun={hasRunningRun}
            sourceTweetUrl={sourceTweetUrl}
            submissionState={submissionState}
            usersDirection={usersDirection}
            onSourceTweetUrlChange={updateSourceTweetUrl}
            onSubmit={submitIntake}
            onUsersDirectionChange={updateUsersDirection}
          />
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
