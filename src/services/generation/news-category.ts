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

/**
 * The single source of truth mapping each News Category to its News Category
 * Color — the hex the Final Quote Tweet Image tints its headline band with
 * (ADR-0029). One closed map keyed by the vocabulary, mirroring how
 * `newsCategories` is the one vocabulary tuple: there is no second palette and
 * no competing CSS-variable set. The values are taken from the Figma category
 * frames (file BRspEDx97oRutl2hM0NqpP, node 4131), reconciled against the
 * rendered poster in slice 004's design review. The label text on every band is
 * a single white constant (`quoteTweetColors.label`) — the design needs no
 * per-category foreground.
 */
export const categoryBandColors: Record<NewsCategory, string> = {
  LAUNCHED: "#9C27B0",
  DROPPED: "#9C27B0",
  ACQUIRED: "#FF7A1A",
  SIGNED: "#E63946",
  FIRED: "#E63946",
  RESIGNED: "#E63946",
  FUNDED: "#1EA7F0",
  PUBLISHED: "#FFC20E",
  DRAMA: "#6ACB3C",
  VIRAL: "#6ACB3C",
};

/**
 * The band color the Final Quote Tweet Image tints its headline band with for a
 * given run's stamp (ADR-0029). A preset stamp (one of the ten) reads in its own
 * category color; a custom word reads in the operator-picked `newsCategoryColor`,
 * defaulting to the VIRAL color so a custom label always has a band. An absent
 * stamp (a pre-feature run, or a classification that failed back to VIRAL) also
 * resolves to the VIRAL color. The custom path keys off `newsCategoryColor`, not
 * the label text, so it is unaffected by the custom word's casing.
 *
 * The three composite consumers resolve this from the run and thread it through
 * `QuoteTweetComposite`'s `bandColor` prop, the same way they thread `label`.
 */
export function resolveBandColor(newsCategory?: string, newsCategoryColor?: NewsCategory): string {
  if (newsCategory !== undefined && isNewsCategory(newsCategory)) {
    return categoryBandColors[newsCategory];
  }

  return categoryBandColors[newsCategoryColor ?? defaultNewsCategory];
}
