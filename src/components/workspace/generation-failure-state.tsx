"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
        <p className="max-w-sm text-center text-destructive/90 text-sm leading-6">
          {run.failureMessage ?? "Source tweet could not be retrieved."}
        </p>
        {contextFailure?.debugLog?.length ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Open Joke Context Debug Log"
                  className="text-destructive/80 hover:text-destructive"
                  onClick={() => setIsDetailsOpen(true)}
                  size="icon"
                  type="button"
                  variant="ghost"
                />
              }>
              <Eye aria-hidden className="size-3.5" strokeWidth={1.75} />
            </TooltipTrigger>
            <TooltipContent>Failure details</TooltipContent>
          </Tooltip>
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
