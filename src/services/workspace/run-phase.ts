import { collectCompletedImageSets } from "@/services/generation";
import type { GenerationRun } from "./types";

type GenerationRunPhase = NonNullable<GenerationRun["phase"]>;

const inFlightPhases = new Set<GenerationRunPhase>([
  "enrichment-running",
  "text-generation-running",
  "image-generation-running",
]);

const phaseLabels: Record<GenerationRunPhase, string> = {
  "enrichment-running": "Enrichment running",
  failed: "Failed",
  "image-generation-complete": "Image generation complete",
  "image-generation-failed": "Image generation failed",
  "image-generation-running": "Image generation running",
  "text-generation-running": "Text generation running",
  "waiting-for-image-selection": "Waiting for image selection",
};

export function getRunPhaseLabel(run: GenerationRun) {
  if (run.phase) {
    return phaseLabels[run.phase];
  }

  if (run.status === "running") {
    return "Enrichment running";
  }

  if (run.status === "failed") {
    return "Failed";
  }

  return "Completed";
}

export function isRunInFlight(run: GenerationRun) {
  if (run.status === "failed") {
    return false;
  }

  if (run.phase) {
    return inFlightPhases.has(run.phase);
  }

  return run.status === "running";
}

/**
 * A Complete Run is eligible for the Runs Feed: it carries all three pieces a Run
 * Card renders — at least one draft, at least one visual joke, and at least one
 * generated image variation. The variation may live in the source-derived set or
 * in any completed Uploaded Image Set, so a manual run that reached its image
 * through uploads alone (no source-derived set) still qualifies (ADR-0025); the
 * search walks {@link collectCompletedImageSets} in the same order selection does.
 * Pure and computed client-side (no I/O, no schema column, no derived flag); the
 * feed gates the runs it already has on this. Sibling to {@link isRunInFlight}.
 */
export function isCompleteRun(run: GenerationRun) {
  const hasDraft = run.drafts.length > 0;
  const hasVisualJoke = (run.visualJokeSet?.jokes.length ?? 0) > 0;
  const hasImageVariation = collectCompletedImageSets(run).some((imageSet) =>
    imageSet.options.some((option) => option.kind === "variation"),
  );

  return hasDraft && hasVisualJoke && hasImageVariation;
}
