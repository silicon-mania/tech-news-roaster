"use client";

import { OctagonX } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  defaultNewsCategory,
  isNewsCategory,
  type NewsCategoryClassificationState,
  newsCategories,
} from "@/services/generation";
import { FailureDetails } from "./failure-details";
import { TextRevealModal } from "./text-reveal-modal";

/**
 * Cap on the custom stamp word. The composite auto-fits long labels (it shrinks,
 * never truncates), so this is a sanity guard, not a layout constraint — a
 * headline stamp is a punchy word or two, not a sentence.
 */
const customNewsCategoryMaxLength = 24;

type NewsCategorySectionProps = {
  /** The run's current stamp value; an absent value resolves to VIRAL. */
  newsCategory?: string;
  /**
   * The classifier's persisted terminal result-state (ADR-0027 / issue 007). When
   * it is `failed`, the section surfaces a quiet ghost error icon + Quiet Failure
   * Details reveal — without breaking the run, which still stamps VIRAL. A
   * `completed` or absent state shows no error affordance.
   */
  newsCategoryClassification?: NewsCategoryClassificationState;
  /**
   * Pick a vocabulary chip — sets the run's `newsCategory` to it. Each surface
   * routes this through its immediate save (the same whole-run save a Selected
   * Draft / Selected Generated Image switch uses), so the run updates in place and
   * the Final Quote Tweet Image re-stamps live wherever the composite renders.
   */
  onNewsCategoryChange: (newsCategory: string) => void;
  /**
   * Edit the custom word — sets the run's `newsCategory` to free text. Each
   * surface routes this through its debounced autosave (the same path inline draft
   * edits use), so typing doesn't thrash the store. Clearing the field resolves
   * back to VIRAL, the residual floor.
   */
  onNewsCategoryCustomChange: (newsCategory: string) => void;
};

/**
 * The shared News Category editor (ADR-0027): the closed ten-value vocabulary as
 * toggle chips plus a custom-word field, over the Final Quote Tweet Image's
 * headline stamp. One component renders in both the Selected Run sidebar and the
 * workspace — the sharing pattern {@link DraftComparison} and `ImageSetStack`
 * established — so the operator never relearns it between surfaces.
 *
 * Like DraftComparison, this owns only its content (the chips and the field); each
 * surface wraps it in its own "News category" section with a heading sized to
 * match that surface's siblings — the workspace's large `SectionHeader`, the
 * sidebar's compact `h3`.
 *
 * The chip matching the run's value is pre-selected; an absent (pre-feature or
 * value-less) run lights VIRAL, the residual. A custom word — anything outside the
 * ten — lights no chip and fills the field instead: chip and custom word are
 * mutually exclusive. Picking a chip calls `onNewsCategoryChange` (immediate
 * save); editing the field calls `onNewsCategoryCustomChange` (debounced save).
 *
 * When the run's persisted `newsCategoryClassification` is `failed` (issue 007),
 * the section also shows a quiet ghost error icon that reveals the Quiet Failure
 * Details — reusing the same {@link FailureDetails} + {@link TextRevealModal}
 * surface a failed Image Set uses. The failure never breaks the run: it stays a
 * Complete Run and still stamps VIRAL, so the affordance is the section's only
 * trace of it, present whenever the run is reopened (including automated runs).
 */
export function NewsCategorySection({
  newsCategory,
  newsCategoryClassification,
  onNewsCategoryChange,
  onNewsCategoryCustomChange,
}: NewsCategorySectionProps) {
  const [isFailureOpen, setIsFailureOpen] = useState(false);
  // The lit chip: the run's value when it's one of the ten; VIRAL when absent (a
  // pre-feature or value-less run); null for a custom word, which lights no chip.
  const activeCategory =
    newsCategory == null ? defaultNewsCategory : isNewsCategory(newsCategory) ? newsCategory : null;

  // The custom field holds the run's value only when no chip is lit (a free word);
  // a lit chip empties it — chip and custom word are mutually exclusive.
  const customWord = activeCategory === null ? (newsCategory ?? "") : "";

  // The classifier's failure, narrowed to its failed shape — present only when the
  // run carries a `failed` classification. The completed/absent states have nothing
  // to surface here. Its fields are already a {@link StageFailure}, so it feeds the
  // shared FailureDetails directly.
  const failedClassification =
    newsCategoryClassification?.status === "failed" ? newsCategoryClassification : undefined;

  return (
    <div className="grid gap-3">
      {failedClassification ? (
        <div className="flex">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  aria-label="Open News Category Classification Failure Details"
                  className="text-destructive/80 hover:text-destructive"
                  onClick={() => setIsFailureOpen(true)}
                  size="icon"
                  type="button"
                  variant="ghost"
                />
              }>
              <OctagonX aria-hidden className="size-3.5" strokeWidth={1.75} />
            </TooltipTrigger>
            <TooltipContent>News category classification failed</TooltipContent>
          </Tooltip>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {newsCategories.map((category) => {
          const isActive = category === activeCategory;

          return (
            <Button
              aria-pressed={isActive}
              className={isActive ? "ring-1 ring-primary/45" : "text-muted-foreground"}
              key={category}
              // Re-picking the lit chip is a no-op — VIRAL is the floor, so there is
              // no "deselect to nothing" here, and skipping it avoids a redundant
              // whole-run save.
              onClick={isActive ? undefined : () => onNewsCategoryChange(category)}
              size="sm"
              type="button"
              variant={isActive ? "secondary" : "ghost"}>
              {category}
            </Button>
          );
        })}
      </div>
      <Input
        aria-label="Custom news category"
        className="max-w-xs"
        maxLength={customNewsCategoryMaxLength}
        // Typing a word de-highlights every chip; clearing the field (no chip lit)
        // snaps back to VIRAL, the residual floor. The field keeps the typed case —
        // the composite uppercases the stamp itself.
        onChange={(event) => {
          const value = event.target.value;

          onNewsCategoryCustomChange(value.trim().length > 0 ? value : defaultNewsCategory);
        }}
        placeholder="Custom word"
        value={customWord}
      />
      {failedClassification && isFailureOpen ? (
        <TextRevealModal title="Quiet Failure Details" onClose={() => setIsFailureOpen(false)}>
          <FailureDetails failure={failedClassification} />
        </TextRevealModal>
      ) : null}
    </div>
  );
}
