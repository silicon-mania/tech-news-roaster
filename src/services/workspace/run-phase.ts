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
  "image-generation-partially-failed": "Partial image failure",
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
