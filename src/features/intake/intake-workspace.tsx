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
import { indexedDbSavedRunStore } from "./saved-runs-store";
import { parseSourceTweetUrl } from "./source-tweet-url";
import type {
  GenerationEventSource,
  GenerationEventSourceFactory,
  GenerationIntake,
  GenerationRun,
  SavedRunStore,
  SubmissionState,
} from "./types";

export type { GenerationIntake, GenerationRun } from "./types";

type IntakeWorkspaceProps = {
  initialActiveRunId?: string;
  initialRuns?: GenerationRun[];
  generationEventSourceFactory?: GenerationEventSourceFactory;
  onStartGenerationRun?: (intake: GenerationIntake) => void | Promise<void>;
  savedRunStore?: SavedRunStore;
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
  savedRunStore = indexedDbSavedRunStore,
}: IntakeWorkspaceProps) {
  const initialActiveRun =
    initialRuns.find((run) => run.id === initialActiveRunId) ??
    initialRuns.at(0) ??
    null;
  const runSequence = useRef(initialRuns.length);
  const [sourceTweetUrl, setSourceTweetUrl] = useState(
    initialActiveRun?.sourceTweetUrl ?? "",
  );
  const [usersDirection, setUsersDirection] = useState(
    initialActiveRun?.usersDirection ?? "",
  );
  const [runs, setRuns] = useState<GenerationRun[]>(initialRuns);
  const [activeRunId, setActiveRunId] = useState<string | null>(
    initialActiveRun?.id ?? null,
  );
  const [isRunsDrawerOpen, setIsRunsDrawerOpen] = useState(false);
  const [isDirectionPanelOpen, setIsDirectionPanelOpen] = useState(false);
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    kind: "idle",
  });
  const generationEventSources = useRef<Map<string, GenerationEventSource>>(
    new Map(),
  );
  const autosaveTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    return () => {
      for (const eventSource of generationEventSources.current.values()) {
        eventSource.close();
      }

      generationEventSources.current.clear();

      for (const timeout of autosaveTimeouts.current.values()) {
        clearTimeout(timeout);
      }

      autosaveTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    void savedRunStore
      .list()
      .then((savedRuns) => {
        if (!isMounted || savedRuns.length === 0) {
          return;
        }

        setRuns((currentRuns) => mergeRuns(currentRuns, savedRuns));
        setActiveRunId((currentActiveRunId) => {
          if (currentActiveRunId) {
            return currentActiveRunId;
          }

          return savedRuns.at(0)?.id ?? null;
        });
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [savedRunStore]);

  const activeRun = runs.find((run) => run.id === activeRunId) ?? null;
  const activeRunSourceTweetUrl = activeRun?.sourceTweetUrl;
  const hasRunningRun = runs.some((run) => run.status === "running");
  const hasRuns = runs.length > 0;
  const hasUsersDirection = usersDirection.trim().length > 0;

  useEffect(() => {
    if (!activeRunSourceTweetUrl) {
      return;
    }

    setSourceTweetUrl(activeRunSourceTweetUrl);
  }, [activeRunSourceTweetUrl]);

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

    setSourceTweetUrl(parsedSourceTweetUrl.url);
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
            sourceTweet: event.sourceTweet,
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

      const completedRun: GenerationRun = {
        id: runId,
        label: event.run.label,
        sourceTweetUrl: intake.sourceTweetUrl,
        usersDirection: intake.usersDirection,
        status: "completed",
        draftCount: event.run.drafts.length,
        draftTarget,
        drafts: event.run.drafts,
        sourceTweet: event.run.sourceTweet,
        savedAt: new Date().toISOString(),
      };

      setRuns((currentRuns) =>
        currentRuns.map((run) => {
          if (run.id !== runId) {
            return run;
          }

          return completedRun;
        }),
      );

      void savedRunStore.save(completedRun).catch(() => undefined);
      eventSource.close();
      generationEventSources.current.delete(runId);
    });

    eventSource.addEventListener("failed", (message) => {
      const event = parseGenerationStreamEvent(
        JSON.parse((message as MessageEvent<string>).data),
      );

      if (event.type !== "failed") {
        return;
      }

      setRuns((currentRuns) =>
        currentRuns.map((run) => {
          if (run.id !== runId) {
            return run;
          }

          return {
            ...run,
            failureMessage: event.message,
            label: "Source tweet unavailable",
            status: "failed",
          };
        }),
      );
      setSubmissionState({
        kind: "blocked",
        message: event.message,
      });
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

  function updateDraftText(draftId: string, text: string) {
    if (activeRun?.status !== "completed") {
      return;
    }

    const editedRun: GenerationRun = {
      ...activeRun,
      drafts: activeRun.drafts.map((draft) => {
        if (draft.id !== draftId) {
          return draft;
        }

        return {
          ...draft,
          text,
        };
      }),
    };

    setRuns((currentRuns) =>
      currentRuns.map((run) => {
        if (run.id !== editedRun.id) {
          return run;
        }

        return editedRun;
      }),
    );
    scheduleRunAutosave(editedRun);
  }

  function scheduleRunAutosave(run: GenerationRun) {
    const currentTimeout = autosaveTimeouts.current.get(run.id);

    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }

    const timeout = setTimeout(() => {
      autosaveTimeouts.current.delete(run.id);
      void savedRunStore.save(run).catch(() => undefined);
    }, 350);

    autosaveTimeouts.current.set(run.id, timeout);
  }

  function reopenRun(runId: string) {
    const run = runs.find((candidateRun) => candidateRun.id === runId);

    if (!run) {
      return;
    }

    setActiveRunId(run.id);
    setSourceTweetUrl(run.sourceTweetUrl);
    setUsersDirection(run.usersDirection);
    setSubmissionState({ kind: "idle" });
    setIsRunsDrawerOpen(false);
  }

  function deleteSavedRun(runId: string) {
    setRuns((currentRuns) => {
      const nextRuns = currentRuns.filter((run) => run.id !== runId);

      if (runId === activeRunId) {
        const nextActiveRun = nextRuns.at(0) ?? null;

        setActiveRunId(nextActiveRun?.id ?? null);
        setSourceTweetUrl(nextActiveRun?.sourceTweetUrl ?? "");
        setUsersDirection(nextActiveRun?.usersDirection ?? "");
      }

      return nextRuns;
    });

    void savedRunStore.delete(runId).catch(() => undefined);
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

        <ActiveRunPanel
          activeRun={activeRun}
          onDraftTextChange={updateDraftText}
        />
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
            onDeleteRun={deleteSavedRun}
            onSelectRun={reopenRun}
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

function mergeRuns(currentRuns: GenerationRun[], savedRuns: GenerationRun[]) {
  const currentRunIds = new Set(currentRuns.map((run) => run.id));
  const unseenSavedRuns = savedRuns.filter((run) => !currentRunIds.has(run.id));

  return [...currentRuns, ...unseenSavedRuns];
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
