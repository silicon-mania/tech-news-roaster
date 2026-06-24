"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useUploadedImageGeneration } from "@/components/image-sets";
import type { CompositeRasterizer } from "@/services/final-quote-tweet-image";
import {
  collectCompletedImageSets,
  draftTarget,
  type ImageGenerationInput,
} from "@/services/generation";
import type { RuntimeStatus } from "@/services/runtime-status";
import { httpSavedRunStore } from "@/services/saved-runs";
import type {
  GenerationEventSourceFactory,
  GenerationRun,
  GenerationRunInput,
  SavedRunStore,
  SubmissionState,
} from "@/services/workspace";
import { createRunId, isRunInFlight, parseSourceTweetUrl } from "@/services/workspace";
import { ActiveRunPanel } from "./active-run-panel";
import { DirectionPanelContext } from "./direction-panel-context";
import { FinalQuoteTweetImageOverlay } from "./final-quote-tweet-image-overlay";
import { GenerationRunForm } from "./generation-run-form";
import { RunsSidebar } from "./runs-sidebar";
import { genericRunningRunLabel, useGenerationRunStream } from "./use-generation-stream";
import { useImageGenerationStream } from "./use-image-generation-stream";
import { useRunAutosave } from "./use-run-autosave";
import { useRunsSidebarPin } from "./use-runs-sidebar-pin";
import { useRuntimeStatus } from "./use-runtime-status";
import { useSavedRunHydration } from "./use-saved-run-hydration";
import { WorkspaceHeader } from "./workspace-header";

export type { GenerationRun, GenerationRunInput } from "@/services/workspace";

type WorkspaceProps = {
  initialActiveRunId?: string;
  initialRuns?: GenerationRun[];
  generationEventSourceFactory?: GenerationEventSourceFactory;
  imageGenerationStreamFetcher?: typeof fetch;
  uploadImageFetcher?: typeof fetch;
  initialRuntimeStatus?: RuntimeStatus;
  onStartGenerationRun?: (runInput: GenerationRunInput) => void | Promise<void>;
  onStartImageGeneration?: (input: ImageGenerationInput) => void | Promise<void>;
  rasterizeComposite?: CompositeRasterizer;
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
  uploadImageFetcher = fetch,
  initialActiveRunId,
  initialRuns = [],
  initialRuntimeStatus,
  onStartGenerationRun,
  onStartImageGeneration,
  rasterizeComposite,
  runtimeEnvironment = process.env.NODE_ENV === "production" ? "production" : "development",
  runtimeStatusFetcher,
  savedRunStore = httpSavedRunStore,
}: WorkspaceProps) {
  const initialActiveRun =
    initialRuns.find((run) => run.id === initialActiveRunId) ?? initialRuns.at(0) ?? null;
  const [sourceTweetUrl, setSourceTweetUrl] = useState(initialActiveRun?.sourceTweetUrl ?? "");
  const [usersDirection, setUsersDirection] = useState(initialActiveRun?.usersDirection ?? "");
  const [runs, setRuns] = useState<GenerationRun[]>(initialRuns);
  const [activeRunId, setActiveRunId] = useState<string | null>(initialActiveRun?.id ?? null);
  const { isPinned: isRunsSidebarPinned, togglePinned: toggleRunsSidebarPinned } =
    useRunsSidebarPin();
  const [openDirectionPanelId, setOpenDirectionPanelId] = useState<string | null>(null);
  const toggleDirectionPanel = useCallback((panelId: string) => {
    setOpenDirectionPanelId((current) => (current === panelId ? null : panelId));
  }, []);
  const closeDirectionPanel = useCallback(() => setOpenDirectionPanelId(null), []);
  const directionPanel = useMemo(
    () => ({
      closePanel: closeDirectionPanel,
      openPanelId: openDirectionPanelId,
      togglePanel: toggleDirectionPanel,
    }),
    [closeDirectionPanel, openDirectionPanelId, toggleDirectionPanel],
  );
  const [submissionState, setSubmissionState] = useState<SubmissionState>({
    kind: "idle",
  });
  const runtimeStatus = useRuntimeStatus({ initialRuntimeStatus, runtimeStatusFetcher });
  const { saveRunNow, scheduleRunAutosave } = useRunAutosave(savedRunStore);
  const { streamImageGeneration } = useImageGenerationStream({
    scheduleRunAutosave,
    setRuns,
    streamFetcher: imageGenerationStreamFetcher,
  });
  // Same shared uploader hook the sidebar drives — but the workspace folds the new
  // Uploaded Image Set in through its existing debounced autosave path rather than
  // the sidebar's immediate save.
  const { generatingRunId, uploadImage } = useUploadedImageGeneration({
    persistRun: scheduleRunAutosave,
    setRuns,
    uploadFetcher: uploadImageFetcher,
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeRunId is the intended trigger — close any open direction panel whenever the active run changes, even though the body only resets state.
  useEffect(() => {
    setOpenDirectionPanelId(null);
  }, [activeRunId]);

  const activeRunStatus = activeRun?.status;
  const activeRunSeenAt = activeRun?.seenAt;

  // Opening a run marks it seen. This fires for the run restored on load, a run
  // reopened from the sidebar, and a freshly completed run the operator is
  // already viewing — any run that becomes the active, settled (non-running) run
  // while still unseen. The seenAt is persisted so the unseen marker clears
  // across reloads and devices (ADR-0019); in-flight runs are left untouched.
  useEffect(() => {
    if (
      !activeRunId ||
      activeRunStatus === undefined ||
      activeRunStatus === "running" ||
      activeRunSeenAt
    ) {
      return;
    }

    const seenAt = new Date().toISOString();

    setRuns((currentRuns) =>
      currentRuns.map((run) => (run.id === activeRunId && !run.seenAt ? { ...run, seenAt } : run)),
    );
    void savedRunStore.markSeen(activeRunId).catch(() => undefined);
  }, [activeRunId, activeRunSeenAt, activeRunStatus, savedRunStore]);

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
      uploadedImageSets: [],
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

  function updateSelectedDraft(draftId: string | null) {
    if (activeRun?.status !== "completed") {
      return;
    }

    if (draftId && !activeRun.drafts.some((draft) => draft.id === draftId)) {
      return;
    }

    const updatedRun: GenerationRun = {
      ...activeRun,
      selectedDraftId: draftId ?? undefined,
    };

    setRuns((currentRuns) =>
      currentRuns.map((run) => (run.id === updatedRun.id ? updatedRun : run)),
    );
    scheduleRunAutosave(updatedRun);
  }

  function updateSelectedGeneratedImage(runId: string, imageOptionId: string | null) {
    const run = runs.find((candidateRun) => candidateRun.id === runId);

    if (!run) {
      return;
    }

    // Only the four generated variations are switchable — never an Image Original —
    // and the option may live in any completed set (source-derived or uploaded), so
    // resolution searches across every set (ADR-0025). A non-variation option or a
    // dangling id is ignored.
    if (
      imageOptionId &&
      !collectCompletedImageSets(run).some((imageSet) =>
        imageSet.options.some(
          (option) => option.id === imageOptionId && option.kind === "variation",
        ),
      )
    ) {
      return;
    }

    const updatedRun: GenerationRun = {
      ...run,
      selectedGeneratedImage: imageOptionId
        ? {
            imageOptionId,
            selectedAt: new Date().toISOString(),
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

  function applyNewsCategory(newsCategory: string, save: (run: GenerationRun) => void) {
    if (activeRun?.status !== "completed") {
      return;
    }

    const updatedRun: GenerationRun = {
      ...activeRun,
      newsCategory,
    };

    setRuns((currentRuns) =>
      currentRuns.map((run) => (run.id === updatedRun.id ? updatedRun : run)),
    );
    save(updatedRun);
  }

  // A chip pick is a discrete choice — it saves immediately (like a Selected Draft
  // / Selected Generated Image switch), not on the debounced free-text path (ADR-0027).
  function updateNewsCategory(newsCategory: string) {
    applyNewsCategory(newsCategory, saveRunNow);
  }

  // A custom-word edit is free text — it rides the debounced autosave (like inline
  // draft editing), so typing doesn't thrash the store on every keystroke (ADR-0027).
  function updateNewsCategoryCustom(newsCategory: string) {
    applyNewsCategory(newsCategory, scheduleRunAutosave);
  }

  function startImageGeneration(input: ImageGenerationInput) {
    const run = runs.find((candidateRun) => candidateRun.id === input.parentRunId);

    if (!run?.imageOriginalCandidates) {
      return;
    }

    const startedAt = new Date().toISOString();
    const startedImageGenerationState: GenerationRun["imageGenerationState"] = {
      selectedImageId: input.selectedImageId,
      startedAt,
      status: "running",
      userImagePrompt: input.userImagePrompt,
    };
    const selectedImageOriginalCandidates = run.imageOriginalCandidates.filter(
      (candidate) => candidate.id === input.selectedImageId,
    );
    const startedRun: GenerationRun = {
      ...run,
      imageGenerationState: startedImageGenerationState,
      imageOriginalCandidates: selectedImageOriginalCandidates,
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
      imageOriginalCandidates: startedRun.imageOriginalCandidates,
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
    <DirectionPanelContext.Provider value={directionPanel}>
      <main
        className={`min-h-screen overflow-hidden py-4 text-foreground transition-[padding] duration-300 ease-out sm:py-6 ${
          isRunsSidebarPinned ? "pl-3 sm:pl-8 lg:pl-[20rem]" : "pl-3 sm:pl-8 lg:pl-10"
        } ${openDirectionPanelId ? "pr-3 sm:pr-8 lg:pr-[20rem]" : "pr-3 sm:pr-8 lg:pr-10"}`}>
        {hasRuns ? (
          <div className="mx-auto grid min-h-[calc(100vh-2rem)] w-full max-w-5xl grid-rows-[auto_auto_1fr] gap-4 sm:min-h-[calc(100vh-3rem)] sm:gap-6">
            <WorkspaceHeader compact />

            <GenerationRunForm
              hasRuns
              isRunDisabled={hasInFlightRun || productionRunDisabled}
              runtimeNotice={runtimeNotice}
              sourceTweetUrl={sourceTweetUrl}
              submissionState={submissionState}
              usersDirection={usersDirection}
              onSourceTweetUrlChange={updateSourceTweetUrl}
              onSubmit={submitSourceTweet}
              onUsersDirectionChange={updateUsersDirection}
            />

            <ActiveRunPanel
              activeRun={activeRun}
              isUploadGenerating={generatingRunId !== null}
              onDraftTextChange={updateDraftText}
              onNewsCategoryChange={updateNewsCategory}
              onNewsCategoryCustomChange={updateNewsCategoryCustom}
              onSelectedDraftChange={updateSelectedDraft}
              onSelectedGeneratedImageChange={updateSelectedGeneratedImage}
              onStartImageGeneration={startImageGeneration}
              onUploadImage={uploadImage}
            />
          </div>
        ) : (
          <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col items-center justify-center gap-8 sm:min-h-[calc(100vh-3rem)] sm:gap-10">
            <WorkspaceHeader />

            <GenerationRunForm
              hasRuns={false}
              isRunDisabled={hasInFlightRun || productionRunDisabled}
              runtimeNotice={runtimeNotice}
              sourceTweetUrl={sourceTweetUrl}
              submissionState={submissionState}
              usersDirection={usersDirection}
              onSourceTweetUrlChange={updateSourceTweetUrl}
              onSubmit={submitSourceTweet}
              onUsersDirectionChange={updateUsersDirection}
            />
          </div>
        )}

        <RunsSidebar
          activeRunId={activeRunId}
          isPinned={isRunsSidebarPinned}
          runs={runs}
          onDeleteRun={deleteSavedRun}
          onSelectRun={reopenRun}
          onTogglePinned={toggleRunsSidebarPinned}
        />

        <FinalQuoteTweetImageOverlay rasterizeComposite={rasterizeComposite} run={activeRun} />
      </main>
    </DirectionPanelContext.Provider>
  );
}
