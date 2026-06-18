"use client";

import { Circle, CircleDot, Copy, Star } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { VisualJoke, VisualJokeSection, VisualJokeSet } from "@/services/generation";
import { copyTextToClipboard } from "@/utils/copy-text-to-clipboard";
import { JokeTitleEditor } from "./joke-title-editor";

// The three Visual Joke Sections in direction order, each with its
// operator-facing label. The flat `jokes` array is grouped by `section` at render
// time so the list mirrors the direction the operator reads in the quiet reveal.
const VISUAL_JOKE_SECTIONS: { id: VisualJokeSection; label: string }[] = [
  { id: "satire", label: "Satire" },
  { id: "tech-positive", label: "Tech-positive" },
  { id: "experimental", label: "Experimental" },
];

/**
 * The grouped Visual Joke list — Satire / Tech-positive / Experimental, with Top
 * Picks flagged, each joke selectable and its Joke Title inline-editable. Shared by
 * the Workspace's Visual Joke area and the Selected Run sidebar so grouping, Top
 * Pick flagging, selection, and title editing behave identically on both surfaces.
 * Each surface supplies its own heading (and, in the Workspace, the direction
 * panel); the callbacks are run-agnostic so the caller binds whichever run it owns.
 */
export function VisualJokeList({
  selectedVisualJokeId,
  visualJokeSet,
  onSelectedVisualJokeChange,
  onVisualJokeTitleChange,
}: {
  selectedVisualJokeId: string | null;
  visualJokeSet: VisualJokeSet;
  onSelectedVisualJokeChange: (visualJokeId: string | null) => void;
  onVisualJokeTitleChange: (visualJokeId: string, title: string) => void;
}) {
  const jokesBySection = groupJokesBySection(visualJokeSet.jokes);
  // The model's ordered Top Picks: the first is Automated Selection's default.
  // We surface the order as a quiet label and never render the internal reason.
  const topPickOrderByJokeId = new Map<string, number>(
    visualJokeSet.topPicks.map((topPick, index) => [topPick.visualJokeId, index + 1]),
  );

  return (
    <section aria-label="Visual Joke Creative Result Area" className="grid gap-6">
      {VISUAL_JOKE_SECTIONS.map((section) => {
        const sectionJokes = jokesBySection.get(section.id) ?? [];
        const isShort = sectionJokes.length < visualJokeSet.targetPerSection;

        return (
          <div className="grid gap-2" key={section.id}>
            <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
              {section.label}
            </h2>
            <ul className="grid gap-2">
              {sectionJokes.map((joke) => (
                <li key={joke.id}>
                  <VisualJokeCard
                    isSelected={selectedVisualJokeId === joke.id}
                    joke={joke}
                    onSelect={onSelectedVisualJokeChange}
                    onTitleChange={(title) => onVisualJokeTitleChange(joke.id, title)}
                    sectionLabel={section.label}
                    topPickOrder={topPickOrderByJokeId.get(joke.id) ?? null}
                  />
                </li>
              ))}
            </ul>
            {isShort ? (
              <p className="text-muted-foreground text-xs leading-5">
                Showing {sectionJokes.length} of {visualJokeSet.targetPerSection} — we'd rather show
                fewer sharp jokes than pad the section.
              </p>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

function VisualJokeCard({
  isSelected,
  joke,
  onSelect,
  onTitleChange,
  sectionLabel,
  topPickOrder,
}: {
  isSelected: boolean;
  joke: VisualJoke;
  onSelect: (visualJokeId: string | null) => void;
  onTitleChange: (title: string) => void;
  sectionLabel: string;
  topPickOrder: number | null;
}) {
  const jokeLabel = `${sectionLabel} visual joke ${joke.order}`;

  return (
    <article
      aria-label={jokeLabel}
      className={`grid gap-3 rounded-md p-3 transition ${
        isSelected ? "bg-primary/10" : "bg-card/70"
      }`}>
      {topPickOrder ? (
        <p className="flex items-center gap-1 text-muted-foreground text-xs">
          <Star aria-hidden className="size-3.5" strokeWidth={1.75} />
          Top pick {topPickOrder}
        </p>
      ) : null}
      <JokeTitleEditor
        label={jokeLabel}
        onValueChange={onTitleChange}
        textClassName="text-sm leading-6 sm:text-base sm:leading-7"
        value={joke.text}
      />
      <div className="flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                aria-label={`Copy ${jokeLabel}`}
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
          aria-label={isSelected ? `Clear ${jokeLabel} selection` : `Select ${jokeLabel}`}
          aria-pressed={isSelected}
          className={`font-normal text-xs ${
            isSelected ? "text-primary hover:text-primary" : "text-muted-foreground"
          }`}
          onClick={() => onSelect(isSelected ? null : joke.id)}
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
  );
}

// Group the flat `jokes` array into the three Visual Joke Sections. The schema
// guarantees within-section `order` is contiguous from 1 in array order, so
// insertion order already reflects the order the operator should read.
function groupJokesBySection(jokes: VisualJoke[]): Map<VisualJokeSection, VisualJoke[]> {
  const bySection = new Map<VisualJokeSection, VisualJoke[]>();

  for (const joke of jokes) {
    const sectionJokes = bySection.get(joke.section) ?? [];
    sectionJokes.push(joke);
    bySection.set(joke.section, sectionJokes);
  }

  return bySection;
}

async function copyVisualJokeText(text: string) {
  if (await copyTextToClipboard(text)) {
    toast.success("Visual joke copied");
    return;
  }

  toast.error("Couldn't copy to clipboard");
}
