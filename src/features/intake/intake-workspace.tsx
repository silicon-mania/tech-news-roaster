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
  type ImageGenerationInput,
  parseGenerationStreamEvent,
} from "@/features/generation/generation-events";
import type { RuntimeStatus } from "@/features/runtime-status/runtime-status";
import {
  ActiveRunPanel,
  IntakeForm,
  RunsList,
  WorkspaceHeader,
} from "./components";
import { isRunInFlight } from "./run-phase";
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
  initialRuntimeStatus?: RuntimeStatus;
  onStartGenerationRun?: (intake: GenerationIntake) => void | Promise<void>;
  onStartImageGeneration?: (
    input: ImageGenerationInput,
  ) => void | Promise<void>;
  runtimeEnvironment?: "development" | "production";
  runtimeStatusFetcher?: () => Promise<RuntimeStatus>;
  savedRunStore?: SavedRunStore;
};

const genericRunningRunLabel = "New generation run";
const liveApiWarningMessage = "Live APIs enabled. Runs may use paid quota.";
const productionNotReadyMessage = "Live integrations are not configured.";

function createGenerationEventSource(url: string) {
  return new EventSource(url);
}

async function fetchRuntimeStatus() {
  const response = await fetch("/api/runtime-status");

  if (!response.ok) {
    throw new Error("Runtime status could not be read.");
  }

  return (await response.json()) as RuntimeStatus;
}

export function IntakeWorkspace({
  generationEventSourceFactory = createGenerationEventSource,
  initialActiveRunId,
  initialRuns = [],
  initialRuntimeStatus,
  onStartGenerationRun,
  onStartImageGeneration,
  runtimeEnvironment = process.env.NODE_ENV === "production"
    ? "production"
    : "development",
  runtimeStatusFetcher = fetchRuntimeStatus,
  savedRunStore = indexedDbSavedRunStore,
}: IntakeWorkspaceProps) {
  const initialActiveRun =
    initialRuns.find((run) => run.id === initialActiveRunId) ??
    initialRuns.at(0) ??
    null;
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
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(
    initialRuntimeStatus ?? null,
  );
  const generationEventSources = useRef<Map<string, GenerationEventSource>>(
    new Map(),
  );
  const enrichedRunState = useRef<
    Map<
      string,
      Pick<GenerationRun, "imageGenerationState" | "newsLinkedImages">
    >
  >(new Map());
  const autosaveTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  useEffect(() => {
    return () => {
      for (const eventSource of generationEventSources.current.values()) {
        eventSource.close();
      }

      generationEventSources.current.clear();
      enrichedRunState.current.clear();

      for (const timeout of autosaveTimeouts.current.values()) {
        clearTimeout(timeout);
      }

      autosaveTimeouts.current.clear();
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (initialRuntimeStatus) {
      return () => {
        isMounted = false;
      };
    }

    void runtimeStatusFetcher()
      .then((status) => {
        if (!isMounted) {
          return;
        }

        setRuntimeStatus(status);
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [initialRuntimeStatus, runtimeStatusFetcher]);

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
  const hasInFlightRun = runs.some(isRunInFlight);
  const hasRuns = runs.length > 0;
  const hasUsersDirection = usersDirection.trim().length > 0;
  const productionRunDisabled =
    runtimeEnvironment === "production" &&
    runtimeStatus?.productionReady !== true;
  const liveApisEnabled = runtimeStatus
    ? runtimeStatus.retrieval.credentials.twitterApiIoApiKey ||
      runtimeStatus.generation.credentials.aiGatewayApiKey
    : false;
  const runtimeNotice =
    runtimeEnvironment === "development" && liveApisEnabled
      ? {
          kind: "warning" as const,
          message: liveApiWarningMessage,
        }
      : runtimeEnvironment === "production" &&
          runtimeStatus?.productionReady === false
        ? {
            kind: "blocked" as const,
            message: productionNotReadyMessage,
          }
        : undefined;

  useEffect(() => {
    if (!activeRunSourceTweetUrl) {
      return;
    }

    setSourceTweetUrl(activeRunSourceTweetUrl);
  }, [activeRunSourceTweetUrl]);

  function submitIntake(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (hasInFlightRun) {
      setSubmissionState({
        kind: "blocked",
        message: "Wait for the running Generation Run to finish first.",
      });
      return;
    }

    if (productionRunDisabled) {
      setSubmissionState({
        kind: "blocked",
        message: productionNotReadyMessage,
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
    const runId = createRunId(runs);
    const runningRun: GenerationRun = {
      id: runId,
      label: genericRunningRunLabel,
      sourceTweetUrl: parsedSourceTweetUrl.url,
      usersDirection: usersDirection.trim(),
      status: "running",
      phase: "enrichment-running",
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

    eventSource.addEventListener("enrichment-completed", (message) => {
      const event = parseGenerationStreamEvent(
        JSON.parse((message as MessageEvent<string>).data),
      );

      if (event.type !== "enrichment-completed") {
        return;
      }

      enrichedRunState.current.set(runId, {
        imageGenerationState: {
          status: "not-started",
        },
        newsLinkedImages: event.newsLinkedImages,
      });

      setRuns((currentRuns) =>
        currentRuns.map((run) => {
          if (run.id !== runId) {
            return run;
          }

          return {
            ...run,
            imageGenerationState: {
              status: "not-started",
            },
            newsLinkedImages: event.newsLinkedImages,
            phase: "text-generation-running",
            sourceTweet: event.sourceTweet,
          };
        }),
      );
    });

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
            phase: "text-generation-running",
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

      const enrichedRun = enrichedRunState.current.get(runId);
      const newsLinkedImages =
        event.run.newsLinkedImages ?? enrichedRun?.newsLinkedImages;
      const imageGenerationState =
        event.run.imageGenerationState ??
        enrichedRun?.imageGenerationState ??
        (newsLinkedImages
          ? {
              status: "not-started" as const,
            }
          : undefined);
      const completedRun: GenerationRun = {
        id: runId,
        label: event.run.label,
        sourceTweetUrl: intake.sourceTweetUrl,
        usersDirection: intake.usersDirection,
        status: "completed",
        draftCount: event.run.drafts.length,
        draftTarget,
        drafts: event.run.drafts,
        failedImageSets: event.run.failedImageSets,
        fallbackDisclosure: event.run.fallbackDisclosure,
        imageGenerationState,
        imageModelProvenance: event.run.imageModelProvenance,
        imageSets: event.run.imageSets,
        newsLinkedImages,
        phase:
          event.run.phase ??
          (imageGenerationState?.status === "running"
            ? "image-generation-running"
            : newsLinkedImages
              ? "waiting-for-image-selection"
              : undefined),
        savedAt: new Date().toISOString(),
        selectedImageOriginals: event.run.selectedImageOriginals,
        sourceTweet: event.run.sourceTweet,
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
      enrichedRunState.current.delete(runId);
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
            phase: "failed",
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
      enrichedRunState.current.delete(runId);
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

  function startImageGeneration(input: ImageGenerationInput) {
    const run = runs.find(
      (candidateRun) => candidateRun.id === input.parentRunId,
    );

    if (!run?.newsLinkedImages) {
      return;
    }

    const startedAt = new Date().toISOString();
    const startedImageGenerationState: GenerationRun["imageGenerationState"] = {
      selectedImageIds: input.selectedImageIds,
      startedAt,
      status: "running",
      userImagePrompt: input.userImagePrompt,
    };
    const selectedImageIds = new Set(input.selectedImageIds);
    const selectedNewsLinkedImages = run.newsLinkedImages.filter((image) =>
      selectedImageIds.has(image.id),
    );
    const startedRun: GenerationRun = {
      ...run,
      imageGenerationState: startedImageGenerationState,
      newsLinkedImages: selectedNewsLinkedImages,
      phase: "image-generation-running",
    };

    setRuns((currentRuns) =>
      currentRuns.map((run) => {
        if (run.id !== input.parentRunId) {
          return run;
        }

        return startedRun;
      }),
    );

    enrichedRunState.current.set(input.parentRunId, {
      imageGenerationState: startedImageGenerationState,
      newsLinkedImages: startedRun.newsLinkedImages,
    });
    scheduleRunAutosave(startedRun);

    void onStartImageGeneration?.(input);
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
    <main className="min-h-screen overflow-hidden px-3 py-4 text-slate-100 sm:px-8 sm:py-6 lg:px-10">
      <div
        className={`mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-5xl grid-rows-[auto_auto_1fr] transition-[gap] duration-300 sm:min-h-[calc(100vh-3rem)] ${
          hasRuns ? "gap-4 sm:gap-6" : "gap-7 sm:gap-10"
        }`}
      >
        <WorkspaceHeader />

        <IntakeForm
          hasRuns={hasRuns}
          hasUsersDirection={hasUsersDirection}
          isRunDisabled={hasInFlightRun || productionRunDisabled}
          runtimeNotice={runtimeNotice}
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
          onStartImageGeneration={startImageGeneration}
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
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-slate-950/70 backdrop-blur-[2px]"
      />
      <aside
        aria-label={label}
        className={`absolute ${sideClass} top-0 grid h-full w-[min(26rem,100vw)] content-start overflow-y-auto border-slate-800/80 bg-[#08090c]/96 p-4 shadow-2xl shadow-black/45 sm:w-[min(26rem,calc(100vw-2rem))] sm:p-6 ${
          side === "left" ? "border-r" : "border-l"
        }`}
      >
        <button
          type="button"
          aria-label={`Close ${label.toLowerCase()}`}
          onClick={onClose}
          className="mb-5 ml-auto inline-flex h-9 w-9 items-center justify-center rounded-sm border border-slate-800 text-slate-500 transition hover:border-slate-600 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-300/20"
        >
          <CloseIcon />
        </button>
        {children}
      </aside>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.3"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6 6 18" />
    </svg>
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
        <p className="editorial-serif text-slate-100 text-xl">
          User&apos;s Direction
        </p>
        <p className="mt-1 text-slate-500 text-xs uppercase tracking-[0.16em]">
          Optional
        </p>
      </div>
      <textarea
        aria-label="User's Direction"
        name="usersDirection"
        value={usersDirection}
        onChange={(event) => onUsersDirectionChange(event.target.value)}
        placeholder="Add context to respect, a constraint, or a line you want challenged."
        className="min-h-52 w-full resize-y rounded-sm border border-slate-800/90 bg-slate-950/70 px-4 py-3 text-base text-slate-100 leading-7 outline-none transition focus:border-sky-300/70 focus:ring-2 focus:ring-sky-300/20"
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

function createRunId(existingRuns: GenerationRun[]) {
  const existingRunIds = new Set(existingRuns.map((run) => run.id));

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const uniquePart =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const runId = `run-${uniquePart}`;

    if (!existingRunIds.has(runId)) {
      return runId;
    }
  }

  return `run-${Date.now()}-${existingRunIds.size}`;
}
