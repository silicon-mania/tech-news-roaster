"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { defaultNewsCategory, isNewsCategory, newsCategories } from "@/services/generation";

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
 * Scope: chips and custom field. The classification-failure UI (007) mounts here
 * in a later slice.
 */
export function NewsCategorySection({
  newsCategory,
  onNewsCategoryChange,
  onNewsCategoryCustomChange,
}: NewsCategorySectionProps) {
  // The lit chip: the run's value when it's one of the ten; VIRAL when absent (a
  // pre-feature or value-less run); null for a custom word, which lights no chip.
  const activeCategory =
    newsCategory == null ? defaultNewsCategory : isNewsCategory(newsCategory) ? newsCategory : null;

  // The custom field holds the run's value only when no chip is lit (a free word);
  // a lit chip empties it — chip and custom word are mutually exclusive.
  const customWord = activeCategory === null ? (newsCategory ?? "") : "";

  return (
    <div className="grid gap-3">
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
    </div>
  );
}
