import { cn } from "@/lib/utils";
import { type GenerationRun, isRunInFlight } from "@/services/workspace";

type StageState = "pending" | "running" | "complete" | "failed";

export type StageSegment = { key: string; label: string; state: StageState };

type StageStatus = "not-started" | "running" | "completed" | "failed";

function toStageState(status: StageStatus): StageState {
  switch (status) {
    case "running":
      return "running";
    case "completed":
      return "complete";
    case "failed":
      return "failed";
    default:
      return "pending";
  }
}

/**
 * Derives the three-stage pipeline (Enrichment → Text → Image) from a run's
 * per-stage result states (ADR-0030). Returns null unless the run is a live
 * pipeline — in-flight, or settled with a failed stage — so the scoreboard never
 * lingers over an idle or reopened-complete run. The Runs Feed deliberately has no
 * such surface (it loads only Complete Runs); this honest "live" readout lives in
 * the Workspace, where the per-stage states genuinely exist.
 */
export function deriveStageScoreboard(run: GenerationRun | null): StageSegment[] | null {
  const states = run?.generationResultStates;

  if (!run || !states) {
    return null;
  }

  const segments: StageSegment[] = [
    {
      key: "enrichment",
      label: "Enrichment",
      state: toStageState(states.contextGathering.status),
    },
    { key: "text", label: "Text", state: toStageState(states.textGeneration.status) },
    { key: "image", label: "Image", state: toStageState(states.imageGeneration.status) },
  ];

  const isLive = isRunInFlight(run) || segments.some((segment) => segment.state === "failed");

  return isLive ? segments : null;
}

// Each state speaks one signal: green = success, yellow = in-progress, red = failed
// (the reconciled status palette, ADR-0030); pending stays a quiet neutral track.
const STAGE_STYLE: Record<StageState, { bar: string; label: string; word: string }> = {
  pending: { bar: "bg-muted-foreground/15", label: "text-muted-foreground/50", word: "pending" },
  running: { bar: "bg-signal-yellow animate-pulse", label: "text-foreground", word: "running" },
  complete: { bar: "bg-signal-green", label: "text-muted-foreground", word: "complete" },
  failed: { bar: "bg-signal-red", label: "text-signal-red", word: "failed" },
};

/**
 * The Stage Scoreboard (ADR-0030): a glanceable three-segment readout of the active
 * run's pipeline. Each segment fills its signal color as the stage settles — yellow
 * while running (pulsing), green on completion, red on failure — turning ambiguous
 * streaming text into an at-a-glance go-live status. Renders nothing when there is
 * no live pipeline to report.
 */
export function StageScoreboard({ run }: { run: GenerationRun | null }) {
  const segments = deriveStageScoreboard(run);

  if (!segments) {
    return null;
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: a labeled status readout, not a form fieldset
    <div aria-label="Generation pipeline" className="grid gap-1.5" role="group">
      <div className="flex gap-1.5">
        {segments.map((segment) => (
          <span
            aria-hidden
            className={cn(
              "h-1 flex-1 rounded-full transition-colors",
              STAGE_STYLE[segment.state].bar,
            )}
            key={segment.key}
          />
        ))}
      </div>
      <div className="flex gap-1.5">
        {segments.map((segment) => (
          <span
            className={cn(
              "display-locked flex-1 text-[10px] tracking-wide",
              STAGE_STYLE[segment.state].label,
            )}
            key={segment.key}>
            {segment.label}
            <span className="sr-only">: {STAGE_STYLE[segment.state].word}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
