import { parseImageGenerationParentRun } from "@/services/generation";
import type { GenerationRun, GenerationRunInput } from "./types";

export function mergeRuns(currentRuns: GenerationRun[], savedRuns: GenerationRun[]) {
  const currentRunIds = new Set(currentRuns.map((run) => run.id));
  const unseenSavedRuns = savedRuns.filter((run) => !currentRunIds.has(run.id));

  return [...currentRuns, ...unseenSavedRuns];
}

export function extractNewsLinkedImagesFromGenerationResultStates(
  generationResultStates: GenerationRun["generationResultStates"],
) {
  if (generationResultStates?.newsLinkedImageDiscovery.status !== "completed") {
    return undefined;
  }

  return generationResultStates.newsLinkedImageDiscovery.newsLinkedImages;
}

export function deriveRunPhaseFromGenerationResultStates(
  generationResultStates: GenerationRun["generationResultStates"],
) {
  if (!generationResultStates) {
    return undefined;
  }

  if (generationResultStates.imageGeneration.status === "running") {
    return "image-generation-running";
  }

  if (generationResultStates.contextGathering.status === "running") {
    return "enrichment-running";
  }

  if (
    generationResultStates.textGeneration.status === "running" ||
    generationResultStates.newsLinkedImageDiscovery.status === "running" ||
    generationResultStates.visualJokeGeneration.status === "running"
  ) {
    return "text-generation-running";
  }

  return undefined;
}

export function getImageGenerationStartedAt(run: GenerationRun) {
  const state = run.imageGenerationState;

  if (!state || state.status === "not-started") {
    return undefined;
  }

  return state.startedAt;
}

export function buildImageGenerationParentRun(run: GenerationRun) {
  return parseImageGenerationParentRun({
    failedImageSet: run.failedImageSet,
    id: run.id,
    imageGenerationState: run.imageGenerationState,
    imageOriginalCandidates: run.imageOriginalCandidates,
    imageSet: run.imageSet,
    phase: run.phase,
    selectedImageOriginal: run.selectedImageOriginal,
  });
}

export function buildGenerationStreamUrl(runInput: GenerationRunInput) {
  const searchParams = new URLSearchParams({
    sourceTweetUrl: runInput.sourceTweetUrl,
  });

  if (runInput.usersDirection) {
    searchParams.set("usersDirection", runInput.usersDirection);
  }

  return `/api/generation-runs/stream?${searchParams.toString()}`;
}

export function createRunId(existingRuns: GenerationRun[]) {
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
