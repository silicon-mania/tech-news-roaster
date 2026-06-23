/**
 * The closed News Category vocabulary (ADR-0027): the ten values the headline
 * stamp on the Final Quote Tweet Image can carry, in chip display order. `VIRAL`
 * is the residual — the value chosen when nothing more specific fits, and the
 * fallback used on read when a run carries no stamp or when classification fails.
 *
 * This tuple is the single source of truth: the classifier prompt, the editing
 * chips, and the membership check all import it rather than re-listing the
 * values. Each value's meaning and the boundary rules (weight separates DROPPED
 * from PUBLISHED; the stamp follows the Source Tweet's framing; specific events
 * beat DRAMA; mass layoffs are FIRED) live in CONTEXT.md.
 */
export const newsCategories = [
  "LAUNCHED",
  "DROPPED",
  "ACQUIRED",
  "SIGNED",
  "FIRED",
  "RESIGNED",
  "FUNDED",
  "PUBLISHED",
  "DRAMA",
  "VIRAL",
] as const;

export type NewsCategory = (typeof newsCategories)[number];

/**
 * The residual value, and the read-time fallback for a run that carries no
 * `newsCategory` (a pre-feature run) or whose classification failed.
 */
export const defaultNewsCategory: NewsCategory = "VIRAL";

/**
 * Whether a stored `newsCategory` is one of the ten — so it lights its chip —
 * rather than a free custom word, which fills the custom field instead. The two
 * are mutually exclusive (ADR-0027). Case-sensitive: a lowercased value is a
 * custom word, not a vocabulary member.
 */
export function isNewsCategory(value: string): value is NewsCategory {
  return newsCategories.some((category) => category === value);
}

/**
 * Read-time resolution of a run's stamp value: an absent value resolves to
 * VIRAL; a present value (one of the ten or a custom word) resolves to itself.
 */
export function resolveNewsCategory(newsCategory?: string): string {
  return newsCategory ?? defaultNewsCategory;
}

/**
 * The exact text the Final Quote Tweet Image composite stamps in its headline
 * band: the resolved value, uppercased so a lowercase custom word still matches
 * the LAUNCHED / DROPPED / … aesthetic. The three composite consumers (the
 * workspace overlay, the Run Card, and the sidebar download view) pass this
 * through `QuoteTweetComposite`'s `label` prop.
 */
export function resolveNewsCategoryStamp(newsCategory?: string): string {
  return resolveNewsCategory(newsCategory).toUpperCase();
}
