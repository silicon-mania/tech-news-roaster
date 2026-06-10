"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { FailureDetails, type StageFailure } from "./failure-details";
import { TextRevealModal } from "./text-reveal-modal";

export function CreativeFailureArea({
  ariaLabel,
  detailsLabel,
  failure,
  heading,
}: {
  ariaLabel: string;
  detailsLabel: string;
  failure: StageFailure | undefined;
  heading: string;
}) {
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  if (!failure) {
    return null;
  }

  return (
    <>
      <h1 className="font-medium text-foreground text-lg md:text-2xl">{heading}</h1>
      <section aria-label={ariaLabel} className="grid gap-3 bg-card/40 p-3">
        <article className="grid gap-1 rounded-md bg-destructive/10 p-3">
          <div className="flex items-start justify-between gap-2">
            <p className="font-medium text-destructive text-sm">{heading} failed</p>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={`Open ${detailsLabel}`}
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
          </div>
          <p className="text-destructive/80 text-xs leading-5">
            This result area could not be completed.
          </p>
        </article>
      </section>
      {isDetailsOpen ? (
        <TextRevealModal title={detailsLabel} onClose={() => setIsDetailsOpen(false)}>
          <FailureDetails failure={failure} />
        </TextRevealModal>
      ) : null}
    </>
  );
}
