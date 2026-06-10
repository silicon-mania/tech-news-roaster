"use client";

import { Copy, Eye } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
        <h1 className="font-medium text-foreground text-lg md:text-2xl">Visual jokes</h1>
        {hasVisualJokeDirection ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Open Visual Joke Direction"
                  className="text-muted-foreground"
                  onClick={() => setIsDirectionOpen(true)}
                  size="icon"
                  type="button"
                  variant="ghost"
                />
              }>
              <Eye aria-hidden className="size-3.5" strokeWidth={1.75} />
            </TooltipTrigger>
            <TooltipContent>Visual joke direction</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <section aria-label="Visual Joke Creative Result Area" className="grid gap-3 bg-card/40 p-3">
        <ul className="grid gap-2">
          {visualJokeSet.jokes.map((joke, index) => {
            const isSelected = selectedVisualJokeId === joke.id;

            return (
              <li key={joke.id}>
                <article
                  aria-label={`Visual joke ${index + 1}`}
                  className={`grid gap-3 rounded-md p-3 transition ${
                    isSelected ? "bg-primary/10 ring-1 ring-primary/45" : "bg-card/70"
                  }`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <span className="text-muted-foreground text-xs uppercase tracking-[0.14em]">
                        #{index + 1}
                      </span>
                      {index === 0 ? (
                        <span className="text-muted-foreground/60 text-sm">(Recommended)</span>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Button
                              aria-label={`Copy visual joke ${index + 1}`}
                              className="text-muted-foreground"
                              onClick={() => void copyVisualJokeText(joke.text)}
                              size="icon"
                              type="button"
                              variant="ghost"
                            />
                          }>
                          <Copy aria-hidden className="size-3.5" strokeWidth={1.75} />
                        </TooltipTrigger>
                        <TooltipContent>Copy visual joke</TooltipContent>
                      </Tooltip>
                      <Button
                        aria-label={
                          isSelected
                            ? `Clear visual joke ${index + 1} selection`
                            : `Select visual joke ${index + 1}`
                        }
                        aria-pressed={isSelected}
                        className={`min-w-20 font-medium text-xs ${
                          isSelected ? "bg-primary/15 text-primary hover:bg-primary/25" : ""
                        }`}
                        onClick={() =>
                          onSelectedVisualJokeChange(run.id, isSelected ? null : joke.id)
                        }
                        type="button"
                        variant="secondary">
                        {isSelected ? "Selected" : "Select"}
                      </Button>
                    </div>
                  </div>
                  <p className="break-words text-foreground text-sm leading-6 sm:text-base sm:leading-7">
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
          <pre className="whitespace-pre-wrap break-words rounded-md bg-card p-3 text-foreground/90 text-sm leading-6">
            {run.visualJokeDirection}
          </pre>
        </TextRevealModal>
      ) : null}
    </>
  );
}

async function copyVisualJokeText(text: string) {
  if (await copyTextToClipboard(text)) {
    toast.success("Visual joke copied");
    return;
  }

  toast.error("Couldn't copy to clipboard");
}
