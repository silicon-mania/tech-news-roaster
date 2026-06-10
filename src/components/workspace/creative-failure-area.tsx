"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
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
      <h1 className="font-medium text-slate-100 text-lg md:text-2xl">{heading}</h1>
      <section aria-label={ariaLabel} className="grid gap-3 bg-slate-950/35 p-3">
        <article className="grid gap-2 rounded-sm border border-rose-400/20 bg-rose-950/10 p-3">
          <p className="font-medium text-rose-100 text-sm">{heading} failed</p>
          <p className="text-rose-200/80 text-xs leading-5">
            This result area could not be completed.
          </p>
          <button
            type="button"
            aria-label={`Open ${detailsLabel}`}
            onClick={() => setIsDetailsOpen(true)}
            className="inline-flex h-8 w-fit items-center gap-2 rounded-sm border border-rose-300/20 bg-rose-300/10 px-2.5 text-rose-100 text-xs transition hover:border-rose-200/40 focus:outline-none focus:ring-2 focus:ring-rose-200/20">
            <Eye aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
            Details
          </button>
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
