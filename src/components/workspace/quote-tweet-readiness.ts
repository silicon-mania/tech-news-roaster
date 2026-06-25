import type { GenerationRun } from "@/services/workspace";

/**
 * The overlay's on-air readiness, derived from the run (Signal Desk Phase 4,
 * ADR-0030). The episode is "on air" (PROGRAM) only when the operator has resolved
 * both halves of the post — a Selected Draft (the chosen commentary) and a Selected
 * Generated Image (the variation behind the Final Quote Tweet Image); otherwise it
 * reads STANDBY. The state is carried in words, never by color alone.
 */
export type OverlayReadiness = {
  /** True only when both a Selected Draft and a Selected Generated Image resolve. */
  isProgram: boolean;
  /** Collapsed-peek label: the broadcast on-air ("PGM") / "STANDBY" cue. */
  peekLabel: "PGM" | "STANDBY";
  /** The state spelled out for assistive tech. */
  statusLabel: string;
};

/**
 * Resolves the readiness from the run plus the already-resolved image presence. It
 * owns no state and recomputes on every render, so flipping either selection flips
 * the cue live. `hasSelectedImage` is threaded in — not re-derived — so the cue and
 * the composite always agree on whether the Selected Generated Image resolved (the
 * overlay resolves the variation once and shares the answer). The Selected Draft is
 * the operator's own explicit pick (`selectedDraftId`), never an automated fallback,
 * so PROGRAM means the operator genuinely chose both halves.
 */
export function resolveOverlayReadiness(
  run: GenerationRun,
  hasSelectedImage: boolean,
): OverlayReadiness {
  const hasSelectedDraft = Boolean(
    run.selectedDraftId && run.drafts.some((draft) => draft.id === run.selectedDraftId),
  );
  const isProgram = hasSelectedDraft && hasSelectedImage;

  return {
    isProgram,
    peekLabel: isProgram ? "PGM" : "STANDBY",
    statusLabel: isProgram ? "Program — episode ready" : "Standby — episode not ready",
  };
}
