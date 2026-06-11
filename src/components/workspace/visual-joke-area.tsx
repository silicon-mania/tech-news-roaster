"use client";

import { Circle, CircleDot, Copy, Form } from "lucide-react";
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
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h1 className="title-serif text-2xl text-foreground md:text-3xl">Visual jokes</h1>
        {hasVisualJokeDirection ? (
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Open Visual Joke Direction"
                  className="shrink-0 text-muted-foreground"
                  onClick={() => setIsDirectionOpen(true)}
                  size="icon"
                  type="button"
                  variant="ghost"
                />
              }>
              <Form aria-hidden className="size-3.5" strokeWidth={1.75} />
            </TooltipTrigger>
            <TooltipContent>Visual joke direction</TooltipContent>
          </Tooltip>
        ) : null}
      </div>
      <section aria-label="Visual Joke Creative Result Area" className="grid gap-2">
        <ul className="grid gap-2">
          {visualJokeSet.jokes.map((joke, index) => {
            const isSelected = selectedVisualJokeId === joke.id;

            return (
              <li key={joke.id}>
                <article
                  aria-label={`Visual joke ${index + 1}`}
                  className={`grid gap-3 rounded-md p-3 transition ${
                    isSelected ? "bg-primary/10" : "bg-card/70"
                  }`}>
                  <p className="break-words text-foreground text-sm leading-6 sm:text-base sm:leading-7">
                    {joke.text}
                  </p>
                  <div className="flex items-center gap-1">
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
                      className={`font-normal text-xs ${
                        isSelected ? "text-primary hover:text-primary" : "text-muted-foreground"
                      }`}
                      onClick={() =>
                        onSelectedVisualJokeChange(run.id, isSelected ? null : joke.id)
                      }
                      type="button"
                      variant="ghost">
                      {isSelected ? (
                        <CircleDot aria-hidden className="size-3.5" strokeWidth={1.75} />
                      ) : (
                        <Circle aria-hidden className="size-3.5" strokeWidth={1.75} />
                      )}
                      {isSelected ? "Selected" : "Select"}
                    </Button>
                  </div>
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
