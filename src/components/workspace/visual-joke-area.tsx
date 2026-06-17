"use client";

import { Circle, CircleDot, Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { VisualJokeSet } from "@/services/generation";
import type { GenerationRun } from "@/services/workspace";
import { copyTextToClipboard } from "@/utils/copy-text-to-clipboard";
import { DirectionPanel } from "./direction-panel";
import { useDirectionPanel } from "./direction-panel-context";
import { SectionHeader } from "./section-header";

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
  const { openPanelId, togglePanel } = useDirectionPanel();
  const panelId = "visual-joke-direction";
  const isDirectionOpen = openPanelId === panelId;
  const hasVisualJokeDirection = Boolean(run.visualJokeDirection?.trim());

  return (
    <>
      <SectionHeader
        directionLabel="Visual joke direction"
        directionPanelId={panelId}
        isDirectionOpen={isDirectionOpen}
        onToggleDirection={hasVisualJokeDirection ? () => togglePanel(panelId) : undefined}
        title="Visual jokes"
      />
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
        {visualJokeSet.jokes.length < visualJokeSet.targetCount ? (
          <p className="text-muted-foreground text-xs leading-5">
            Showing {visualJokeSet.jokes.length} of {visualJokeSet.targetCount} — we would rather
            show fewer sharp jokes than pad the set with weaker ones.
          </p>
        ) : null}
      </section>
      {hasVisualJokeDirection ? (
        <DirectionPanel id={panelId} isOpen={isDirectionOpen} title="Visual joke direction">
          <pre className="whitespace-pre-wrap break-words rounded-md bg-card p-3 text-foreground/90 text-sm leading-6">
            {run.visualJokeDirection}
          </pre>
        </DirectionPanel>
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
