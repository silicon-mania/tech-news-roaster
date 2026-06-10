"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import type { GenerationRun } from "@/services/workspace";
import { FailureDetails, getStageFailure } from "./failure-details";
import { TextRevealModal } from "./text-reveal-modal";

export function GenerationFailureState({ run }: { run: GenerationRun }) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const contextFailure = getStageFailure(run.generationResultStates?.contextGathering);

  return (
    <section
      aria-label="Generation failure state"
      aria-live="polite"
      className="grid min-h-[20rem] place-items-center sm:min-h-[24rem]">
      <div className="grid justify-items-center gap-3">
        <p className="max-w-sm text-center text-rose-200 text-sm leading-6">
          {run.failureMessage ?? "Source tweet could not be retrieved."}
        </p>
        {contextFailure?.debugLog?.length ? (
          <button
            type="button"
            aria-label="Open Joke Context Debug Log"
            onClick={() => setIsDetailsOpen(true)}
            className="inline-flex h-8 items-center gap-2 rounded-sm border border-rose-300/20 bg-rose-300/10 px-2.5 text-rose-100 text-xs transition hover:border-rose-200/40 focus:outline-none focus:ring-2 focus:ring-rose-200/20">
            <Eye aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
            Details
          </button>
        ) : null}
        {isDetailsOpen && contextFailure ? (
          <TextRevealModal title="Joke Context Debug Log" onClose={() => setIsDetailsOpen(false)}>
            <FailureDetails failure={contextFailure} />
          </TextRevealModal>
        ) : null}
      </div>
    </section>
  );
}
