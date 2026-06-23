"use client";

import { Button } from "@/components/ui/button";
import { defaultNewsCategory, isNewsCategory, newsCategories } from "@/services/generation";

type NewsCategorySectionProps = {
  /** The run's current stamp value; an absent value resolves to VIRAL. */
  newsCategory?: string;
  /**
   * Pick a category — sets the run's `newsCategory` to it. Each surface routes
   * this through its immediate save (the same whole-run save a Selected Draft /
   * Selected Generated Image switch uses), so the run updates in place and the
   * Final Quote Tweet Image re-stamps live wherever the composite renders.
   */
  onNewsCategoryChange: (newsCategory: string) => void;
};

/**
 * The shared News Category editor (ADR-0027): the closed ten-value vocabulary as
 * toggle chips over the Final Quote Tweet Image's headline stamp. One component
 * renders in both the Selected Run sidebar and the workspace — the sharing
 * pattern {@link DraftComparison} and `ImageSetStack` established — so the
 * operator never relearns it between surfaces.
 *
 * The chip matching the run's value is pre-selected; an absent (pre-feature or
 * value-less) run lights VIRAL, the residual. Picking a chip calls
 * `onNewsCategoryChange`.
 *
 * Scope: chips only. The custom-word field (006) and the classification-failure
 * UI (007) mount here in later slices.
 */
export function NewsCategorySection({
  newsCategory,
  onNewsCategoryChange,
}: NewsCategorySectionProps) {
  // The lit chip: the run's value when it's one of the ten; VIRAL when absent (a
  // pre-feature or value-less run). A custom word — not yet settable here —
  // lights no chip, a forward-compatible no-selection state for slice 006.
  const activeCategory =
    newsCategory == null ? defaultNewsCategory : isNewsCategory(newsCategory) ? newsCategory : null;

  return (
    <section aria-label="News category" className="grid min-w-0 gap-3">
      <h3 className="title-serif text-foreground text-lg">News category</h3>
      <div className="flex flex-wrap gap-2">
        {newsCategories.map((category) => {
          const isActive = category === activeCategory;

          return (
            <Button
              aria-pressed={isActive}
              className={isActive ? "ring-1 ring-primary/45" : "text-muted-foreground"}
              key={category}
              // Re-picking the lit chip is a no-op — VIRAL is the floor, so there
              // is no "deselect to nothing" here, and skipping it avoids a
              // redundant whole-run save.
              onClick={isActive ? undefined : () => onNewsCategoryChange(category)}
              size="sm"
              type="button"
              variant={isActive ? "secondary" : "ghost"}>
              {category}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
