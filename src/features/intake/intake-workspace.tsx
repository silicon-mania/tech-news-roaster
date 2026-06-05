"use client";

import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
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
  const [isRunsDrawerOpen, setIsRunsDrawerOpen] = useState(false);
  const [isDirectionPanelOpen, setIsDirectionPanelOpen] = useState(false);
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
  const hasRuns = runs.length > 0;
  const hasUsersDirection = usersDirection.trim().length > 0;

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
    <main className="min-h-screen overflow-hidden px-4 py-5 text-slate-100 sm:px-8 lg:px-10">
      <div
        className={`mx-auto grid min-h-[calc(100vh-2.5rem)] w-full max-w-5xl grid-rows-[auto_auto_1fr] transition-[gap] duration-300 ${
          hasRuns ? "gap-5 sm:gap-6" : "gap-8 sm:gap-10"
        }`}
      >
        <WorkspaceHeader />

        <IntakeForm
          hasRunningRun={hasRunningRun}
          hasRuns={hasRuns}
          hasUsersDirection={hasUsersDirection}
          runsCount={runs.length}
          sourceTweetUrl={sourceTweetUrl}
          submissionState={submissionState}
          onOpenDirectionPanel={() => setIsDirectionPanelOpen(true)}
          onOpenRunsDrawer={() => setIsRunsDrawerOpen(true)}
          onSourceTweetUrlChange={updateSourceTweetUrl}
          onSubmit={submitIntake}
        />

        <ActiveRunPanel activeRun={activeRun} />
      </div>

      {isRunsDrawerOpen ? (
        <PanelOverlay
          label="Runs drawer"
          side="left"
          onClose={() => setIsRunsDrawerOpen(false)}
        >
          <RunsList
            activeRunId={activeRunId}
            runs={runs}
            onSelectRun={(runId) => {
              setActiveRunId(runId);
              setIsRunsDrawerOpen(false);
            }}
          />
        </PanelOverlay>
      ) : null}

      {isDirectionPanelOpen ? (
        <PanelOverlay
          label="User's direction panel"
          side="right"
          onClose={() => setIsDirectionPanelOpen(false)}
        >
          <UsersDirectionPanel
            usersDirection={usersDirection}
            onUsersDirectionChange={updateUsersDirection}
          />
        </PanelOverlay>
      ) : null}
    </main>
  );
}

type PanelOverlayProps = {
  children: ReactNode;
  label: string;
  side: "left" | "right";
  onClose: () => void;
};

function PanelOverlay({ children, label, onClose, side }: PanelOverlayProps) {
  const sideClass = side === "left" ? "left-0" : "right-0";

  return (
    <div className="fixed inset-0 z-40">
      <button
        type="button"
        aria-label={`Close ${label.toLowerCase()}`}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/62"
      />
      <aside
        aria-label={label}
        className={`absolute ${sideClass} top-0 grid h-full w-[min(25rem,calc(100vw-2rem))] content-start overflow-y-auto border-slate-800 bg-slate-950/95 p-5 shadow-2xl shadow-black/40 sm:p-6 ${
          side === "left" ? "border-r" : "border-l"
        }`}
      >
        {children}
      </aside>
    </div>
  );
}

type UsersDirectionPanelProps = {
  usersDirection: string;
  onUsersDirectionChange: (usersDirection: string) => void;
};

function UsersDirectionPanel({
  usersDirection,
  onUsersDirectionChange,
}: UsersDirectionPanelProps) {
  return (
    <div className="grid gap-4">
      <div>
        <p className="font-medium text-slate-200 text-sm">
          User&apos;s Direction
        </p>
        <p className="mt-1 text-slate-500 text-sm">Optional</p>
      </div>
      <textarea
        aria-label="User's Direction"
        name="usersDirection"
        value={usersDirection}
        onChange={(event) => onUsersDirectionChange(event.target.value)}
        placeholder="Add context to respect, a constraint, or a line you want challenged."
        className="min-h-52 w-full resize-y rounded-lg border border-slate-800 bg-slate-900/70 px-4 py-3 text-base text-slate-100 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-400/25"
      />
    </div>
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
