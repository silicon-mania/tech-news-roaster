"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect, useRef } from "react";
import { draftTarget, parseGenerationStreamEvent } from "@/services/generation";
import type {
  GenerationEventSource,
  GenerationEventSourceFactory,
  GenerationRun,
  GenerationRunInput,
  SavedRunStore,
  SubmissionState,
} from "@/services/workspace";
import {
  buildGenerationStreamUrl,
  deriveRunPhaseFromGenerationResultStates,
  extractNewsLinkedImagesFromGenerationResultStates,
} from "@/services/workspace";

export const genericRunningRunLabel = "New generation run";

export type EnrichedRunState = Pick<
  GenerationRun,
  "generationResultStates" | "imageGenerationState" | "imageOriginalCandidates" | "newsLinkedImages"
>;

export function useGenerationRunStream({
  generationEventSourceFactory,
  savedRunStore,
  setRuns,
  setSubmissionState,
}: {
  generationEventSourceFactory: GenerationEventSourceFactory;
  savedRunStore: SavedRunStore;
  setRuns: Dispatch<SetStateAction<GenerationRun[]>>;
  setSubmissionState: Dispatch<SetStateAction<SubmissionState>>;
}) {
  const generationEventSources = useRef<Map<string, GenerationEventSource>>(new Map());
  const enrichedRunState = useRef<Map<string, EnrichedRunState>>(new Map());

  useEffect(() => {
    return () => {
      for (const eventSource of generationEventSources.current.values()) {
        eventSource.close();
      }

      generationEventSources.current.clear();
      enrichedRunState.current.clear();
    };
  }, []);

  function subscribeToGenerationRun(runId: string, runInput: GenerationRunInput) {
    const eventSource = generationEventSourceFactory(buildGenerationStreamUrl(runInput));

    generationEventSources.current.set(runId, eventSource);

    eventSource.addEventListener("run-state", (message) => {
      const event = parseGenerationStreamEvent(JSON.parse((message as MessageEvent<string>).data));

      if (event.type !== "run-state") {
        return;
      }

      const newsLinkedImages =
        extractNewsLinkedImagesFromGenerationResultStates(event.generationResultStates) ??
        enrichedRunState.current.get(runId)?.newsLinkedImages;
      const imageOriginalCandidates = enrichedRunState.current.get(runId)?.imageOriginalCandidates;

      enrichedRunState.current.set(runId, {
        generationResultStates: event.generationResultStates,
        imageGenerationState: {
          status: "not-started",
        },
        imageOriginalCandidates,
        newsLinkedImages,
      });

      setRuns((currentRuns) =>
        currentRuns.map((run) => {
          if (run.id !== runId) {
            return run;
          }

          return {
            ...run,
            generationResultStates: event.generationResultStates,
            imageOriginalCandidates,
            label: run.label === genericRunningRunLabel ? event.label : run.label,
            newsLinkedImages,
            phase: deriveRunPhaseFromGenerationResultStates(event.generationResultStates),
            sourceTweet: event.sourceTweet,
          };
        }),
      );
    });

    eventSource.addEventListener("enrichment-completed", (message) => {
      const event = parseGenerationStreamEvent(JSON.parse((message as MessageEvent<string>).data));

      if (event.type !== "enrichment-completed") {
        return;
      }

      enrichedRunState.current.set(runId, {
        generationResultStates: enrichedRunState.current.get(runId)?.generationResultStates,
        imageGenerationState: {
          status: "not-started",
        },
        imageOriginalCandidates: event.imageOriginalCandidates,
        newsLinkedImages: event.newsLinkedImages,
      });

      setRuns((currentRuns) =>
        currentRuns.map((run) => {
          if (run.id !== runId) {
            return run;
          }

          return {
            ...run,
            generationResultStates: run.generationResultStates,
            imageGenerationState: {
              status: "not-started",
            },
            imageOriginalCandidates: event.imageOriginalCandidates,
            newsLinkedImages: event.newsLinkedImages,
            phase: "text-generation-running",
            sourceTweet: event.sourceTweet,
          };
        }),
      );
    });

    eventSource.addEventListener("progress", (message) => {
      const event = parseGenerationStreamEvent(JSON.parse((message as MessageEvent<string>).data));

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
            generationResultStates: run.generationResultStates,
            label: run.label === genericRunningRunLabel ? event.label : run.label,
            phase: "text-generation-running",
            sourceTweet: event.sourceTweet,
          };
        }),
      );
    });

    eventSource.addEventListener("completed", (message) => {
      const event = parseGenerationStreamEvent(JSON.parse((message as MessageEvent<string>).data));

      if (event.type !== "completed") {
        return;
      }

      const enrichedRun = enrichedRunState.current.get(runId);
      const newsLinkedImages = event.run.newsLinkedImages ?? enrichedRun?.newsLinkedImages;
      const imageOriginalCandidates =
        event.run.imageOriginalCandidates ?? enrichedRun?.imageOriginalCandidates;
      const hasImageOriginalCandidates = (imageOriginalCandidates?.length ?? 0) > 0;
      const imageGenerationState =
        event.run.imageGenerationState ??
        enrichedRun?.imageGenerationState ??
        (hasImageOriginalCandidates
          ? {
              status: "not-started" as const,
            }
          : undefined);
      const completedRun: GenerationRun = {
        id: runId,
        label: event.run.label,
        origin: "manual",
        sourceTweetUrl: runInput.sourceTweetUrl,
        usersDirection: runInput.usersDirection,
        status: "completed",
        draftCount: event.run.drafts.length,
        draftTarget,
        drafts: event.run.drafts,
        failedImageSet: event.run.failedImageSet,
        fallbackDisclosure: event.run.fallbackDisclosure,
        generationResultStates: event.run.generationResultStates,
        imageGenerationState,
        imageModelProvenance: event.run.imageModelProvenance,
        imageOriginalCandidates,
        imageSet: event.run.imageSet,
        // A freshly completed generation run has no operator uploads yet (ADR-0025).
        uploadedImageSets: [],
        jokeContextSnapshot: event.run.jokeContextSnapshot,
        newsLinkedImages,
        phase:
          event.run.phase ??
          (imageGenerationState?.status === "running"
            ? "image-generation-running"
            : hasImageOriginalCandidates
              ? "waiting-for-image-selection"
              : deriveRunPhaseFromGenerationResultStates(event.run.generationResultStates)),
        savedAt: new Date().toISOString(),
        selectedVisualJoke: event.run.selectedVisualJoke,
        selectedImageOriginal: event.run.selectedImageOriginal,
        sourceTweet: event.run.sourceTweet,
        visualJokeDirection: event.run.visualJokeDirection,
        visualJokeSet: event.run.visualJokeSet,
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
      const event = parseGenerationStreamEvent(JSON.parse((message as MessageEvent<string>).data));

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

  return { enrichedRunState, subscribeToGenerationRun };
}
