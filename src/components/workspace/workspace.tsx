"use client";

import { type FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { draftTarget, type ImageGenerationInput } from "@/services/generation";
import type { RuntimeStatus } from "@/services/runtime-status";
import { indexedDbSavedRunStore } from "@/services/saved-runs";
import type {
  GenerationEventSourceFactory,
  GenerationRun,
  GenerationRunInput,
  SavedRunStore,
  SubmissionState,
} from "@/services/workspace";
import { createRunId, isRunInFlight, parseSourceTweetUrl } from "@/services/workspace";
import { ActiveRunPanel } from "./active-run-panel";
import { GenerationRunForm } from "./generation-run-form";
import { PanelOverlay } from "./panel-overlay";
import { RunsList } from "./runs-list";
import { genericRunningRunLabel, useGenerationRunStream } from "./use-generation-stream";
import { useImageGenerationStream } from "./use-image-generation-stream";
import { useRunAutosave } from "./use-run-autosave";
import { useRuntimeStatus } from "./use-runtime-status";
import { useSavedRunHydration } from "./use-saved-run-hydration";
import { UsersDirectionPanel } from "./users-direction-panel";
import { WorkspaceHeader } from "./workspace-header";

export type { GenerationRun, GenerationRunInput } from "@/services/workspace";

type WorkspaceProps = {
  initialActiveRunId?: string;
  initialRuns?: GenerationRun[];
  generationEventSourceFactory?: GenerationEventSourceFactory;
  imageGenerationStreamFetcher?: typeof fetch;
  initialRuntimeStatus?: RuntimeStatus;
  onStartGenerationRun?: (runInput: GenerationRunInput) => void | Promise<void>;
  onStartImageGeneration?: (input: ImageGenerationInput) => void | Promise<void>;
  runtimeEnvironment?: "development" | "production";
  runtimeStatusFetcher?: () => Promise<RuntimeStatus>;
  savedRunStore?: SavedRunStore;
};

const developmentImagesUnavailableMessage =
  "News-linked images unavailable. Set OUTSIDE_X_ENRICHMENT_ENDPOINT to enable image generation.";
const liveApiWarningMessage = "Live APIs enabled. Runs may use paid quota.";
const productionNotReadyMessage = "Live integrations are not configured.";

function createGenerationEventSource(url: string) {
  return new EventSource(url);
}

export function Workspace({
  generationEventSourceFactory = createGenerationEventSource,
  imageGenerationStreamFetcher = fetch,
  initialActiveRunId,
  initialRuns = [],
  initialRuntimeStatus,
  onStartGenerationRun,
  onStartImageGeneration,
  runtimeEnvironment = process.env.NODE_ENV === "production" ? "production" : "development",
  runtimeStatusFetcher,
  savedRunStore = indexedDbSavedRunStore,
}: WorkspaceProps) {
  const initialActiveRun =
    initialRuns.find((run) => run.id === initialActiveRunId) ?? initialRuns.at(0) ?? null;
  const [sourceTweetUrl, setSourceTweetUrl] = useState(initialActiveRun?.sourceTweetUrl ?? "");
  const [usersDirection, setUsersDirection] = useState(initialActiveRun?.usersDirection ?? "");
  const [runs, setRuns] = useState<GenerationRun[]>(initialRuns);
  const [activeRunId, setActiveRunId] = useState<string | null>(initialActiveRun?.id ?? null);
  const [isRunsDrawerOpen, setIsRunsDrawerOpen] = useState(false);
  const [isDirectionPanelOpen, setIsDirectionPanelOpen] = useState(false);
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    kind: "idle",
  });
  const runtimeStatus = useRuntimeStatus({ initialRuntimeStatus, runtimeStatusFetcher });
  const { scheduleRunAutosave } = useRunAutosave(savedRunStore);
  const { streamImageGeneration } = useImageGenerationStream({
    scheduleRunAutosave,
    setRuns,
    streamFetcher: imageGenerationStreamFetcher,
  });
  const { enrichedRunState, subscribeToGenerationRun } = useGenerationRunStream({
    generationEventSourceFactory,
    savedRunStore,
    setRuns,
    setSubmissionState,
  });

  useSavedRunHydration({ savedRunStore, setActiveRunId, setRuns });

  const activeRun = runs.find((run) => run.id === activeRunId) ?? null;
  const activeRunSourceTweetUrl = activeRun?.sourceTweetUrl;
  const activeRunUsersDirection = activeRun?.usersDirection;
  const hasInFlightRun = runs.some(isRunInFlight);
  const hasRuns = runs.length > 0;
  const hasUsersDirection = usersDirection.trim().length > 0;
  const productionRunDisabled =
    runtimeEnvironment === "production" && runtimeStatus?.productionReady !== true;
  const liveApisEnabled = runtimeStatus
    ? runtimeStatus.retrieval.credentials.twitterApiIoApiKey ||
      runtimeStatus.generation.credentials.aiGatewayApiKey
    : false;
  const runtimeNotice =
    runtimeEnvironment === "development" && runtimeStatus?.enrichment.mode === "off"
      ? {
          kind: "warning" as const,
          message: developmentImagesUnavailableMessage,
        }
      : runtimeEnvironment === "development" && liveApisEnabled
        ? {
            kind: "warning" as const,
            message: liveApiWarningMessage,
          }
        : runtimeEnvironment === "production" && runtimeStatus?.productionReady === false
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
    setUsersDirection(activeRunUsersDirection ?? "");
  }, [activeRunSourceTweetUrl, activeRunUsersDirection]);

  function submitSourceTweet(event: FormEvent<HTMLFormElement>) {
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

    const runInput = {
      sourceTweetUrl: parsedSourceTweetUrl.url,
      usersDirection: usersDirection.trim(),
    };

    setSourceTweetUrl(parsedSourceTweetUrl.url);
    const runId = createRunId(runs);
    const contextGatheringStartedAt = new Date().toISOString();
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
      generationResultStates: {
        contextGathering: {
          startedAt: contextGatheringStartedAt,
          status: "running",
        },
        imageGeneration: {
          status: "not-started",
        },
        newsLinkedImageDiscovery: {
          status: "not-started",
        },
        textGeneration: {
          status: "not-started",
        },
        visualJokeGeneration: {
          status: "not-started",
        },
      },
    };

    setRuns((currentRuns) => [runningRun, ...currentRuns]);
    setActiveRunId(runId);
    setSubmissionState({ kind: "accepted" });

    void onStartGenerationRun?.(runInput);
    subscribeToGenerationRun(runId, runInput);
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

  function updateSelectedVisualJoke(runId: string, visualJokeId: string | null) {
    const run = runs.find((candidateRun) => candidateRun.id === runId);

    if (!run?.visualJokeSet) {
      return;
    }

    if (visualJokeId && !run.visualJokeSet.jokes.some((joke) => joke.id === visualJokeId)) {
      return;
    }

    const updatedRun: GenerationRun = {
      ...run,
      selectedVisualJoke: visualJokeId
        ? {
            selectedAt: new Date().toISOString(),
            visualJokeId,
          }
        : null,
    };

    setRuns((currentRuns) =>
      currentRuns.map((currentRun) => {
        if (currentRun.id !== runId) {
          return currentRun;
        }

        return updatedRun;
      }),
    );
    scheduleRunAutosave(updatedRun);
  }

  function startImageGeneration(input: ImageGenerationInput) {
    const run = runs.find((candidateRun) => candidateRun.id === input.parentRunId);

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
    void streamImageGeneration(input, run);
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

    void savedRunStore
      .delete(runId)
      .then(() => toast.success("Saved run deleted"))
      .catch(() => toast.error("Couldn't delete saved run"));
  }

  return (
    <main className="min-h-screen overflow-hidden px-3 py-4 text-slate-100 sm:px-8 sm:py-6 lg:px-10">
      <div
        className={`mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-5xl grid-rows-[auto_auto_1fr] transition-[gap] duration-300 sm:min-h-[calc(100vh-3rem)] ${
          hasRuns ? "gap-4 sm:gap-6" : "gap-7 sm:gap-10"
        }`}>
        <WorkspaceHeader />

        <GenerationRunForm
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
          onSubmit={submitSourceTweet}
        />

        <ActiveRunPanel
          activeRun={activeRun}
          onDraftTextChange={updateDraftText}
          onSelectedVisualJokeChange={updateSelectedVisualJoke}
          onStartImageGeneration={startImageGeneration}
        />
      </div>

      {isRunsDrawerOpen ? (
        <PanelOverlay label="Runs drawer" side="left" onClose={() => setIsRunsDrawerOpen(false)}>
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
          onClose={() => setIsDirectionPanelOpen(false)}>
          <UsersDirectionPanel
            usersDirection={usersDirection}
            onUsersDirectionChange={updateUsersDirection}
          />
        </PanelOverlay>
      ) : null}
    </main>
  );
}
