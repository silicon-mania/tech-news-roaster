"use client";

import { Copy, Eye } from "lucide-react";
import { useState } from "react";
import type { VisualJokeSet } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { copyTextToClipboard } from "@/utils/copy-text-to-clipboard";
import { TextRevealModal } from "./text-reveal-modal";

export function VisualJokeArea({
  run,
  visualJokeSet,
  onSelectedVisualJokeChange,
}: {
  run: GenerationRun;
  visualJokeSet: VisualJokeSet;
  onSelectedVisualJokeChange: (runId: string, visualJokeId: string | null) => void;
}) {
  const selectedVisualJokeId = run.selectedVisualJoke?.visualJokeId ?? null;
  const [isDirectionOpen, setIsDirectionOpen] = useState(false);
  const hasVisualJokeDirection = Boolean(run.visualJokeDirection?.trim());

  return (
    <>
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="font-medium text-slate-100 text-lg md:text-2xl">Visual jokes</h1>
        {hasVisualJokeDirection ? (
          <button
            type="button"
            aria-label="Open Visual Joke Direction"
            onClick={() => setIsDirectionOpen(true)}
            className="inline-flex h-8 w-8 items-center justify-center rounded text-slate-500 transition hover:rounded-sm hover:bg-slate-800/45 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
            <Eye aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>
      <section
        aria-label="Visual Joke Creative Result Area"
        className="grid gap-3 bg-slate-950/35 p-3">
        <ul className="grid gap-2">
          {visualJokeSet.jokes.map((joke, index) => {
            const isSelected = selectedVisualJokeId === joke.id;

            return (
              <li key={joke.id}>
                <article
                  aria-label={`Visual joke ${index + 1}`}
                  className={`grid gap-3 rounded-sm border p-3 transition ${
                    isSelected
                      ? "border-sky-300/50 bg-sky-300/10"
                      : "border-white/8 bg-slate-950/45"
                  }`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-slate-500 text-xs uppercase tracking-[0.14em]">
                        #{index + 1}
                      </span>
                      {index === 0 ? (
                        <span className="text-white/30 text-sm">(Recommended)</span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Copy visual joke ${index + 1}`}
                        onClick={() => void copyTextToClipboard(joke.text)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-sm text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
                        <Copy aria-hidden className="h-3.5 w-3.5" strokeWidth={1.75} />
                      </button>
                      <button
                        type="button"
                        aria-label={
                          isSelected
                            ? `Clear visual joke ${index + 1} selection`
                            : `Select visual joke ${index + 1}`
                        }
                        aria-pressed={isSelected}
                        onClick={() =>
                          onSelectedVisualJokeChange(run.id, isSelected ? null : joke.id)
                        }
                        className={`inline-flex h-8 min-w-20 items-center justify-center rounded-sm border px-2 font-medium text-xs transition focus:outline-none focus:ring-2 focus:ring-sky-300/20 ${
                          isSelected
                            ? "border-sky-300/50 bg-sky-300/15 text-sky-100"
                            : "border-slate-700 bg-slate-950/60 text-slate-300 hover:border-slate-500 hover:text-slate-100"
                        }`}>
                        {isSelected ? "Selected" : "Select"}
                      </button>
                    </div>
                  </div>
                  <p className="break-words text-slate-100 text-sm leading-6 sm:text-base sm:leading-7">
                    {joke.text}
                  </p>
                </article>
              </li>
            );
          })}
        </ul>
      </section>
      {isDirectionOpen && run.visualJokeDirection ? (
        <TextRevealModal title="Visual Joke Direction" onClose={() => setIsDirectionOpen(false)}>
          <pre className="whitespace-pre-wrap break-words rounded-sm border border-white/8 bg-slate-950/60 p-3 text-slate-200 text-sm leading-6">
            {run.visualJokeDirection}
          </pre>
        </TextRevealModal>
      ) : null}
    </>
  );
}
