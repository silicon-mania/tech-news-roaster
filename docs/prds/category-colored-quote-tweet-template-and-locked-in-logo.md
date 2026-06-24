# Category-Colored Quote Tweet Template and Locked-In Logo

> Decision record: [ADR-0029](../adr/0029-category-colored-quote-tweet-template-and-locked-in-logo.md)
> (amends [ADR-0018](../adr/0018-deterministic-derived-final-quote-tweet-image.md),
> extends [ADR-0027](../adr/0027-ai-selected-news-category-stamp.md)). Glossary terms
> used below — **Final Quote Tweet Image**, **News Category**, **News Category Color**,
> **Locked-In Logo**, **Quote Repost**, **Run Card**, **Selected Run**, **Selected
> Generated Image** — are defined in [CONTEXT.md](../../CONTEXT.md).

## Problem Statement

When a generation run succeeds, it produces a **Final Quote Tweet Image** — the poster
the operator downloads and posts as a **Quote Repost**. Today that image is built from
an old Figma layout: a flat **black** headline band, a left-aligned title in VC
Henrietta Condensed, and a rainbow stripe across the top. It looks the same for every
run regardless of what the news *is*, so a launch, a firing, and a funding round are
visually indistinguishable, and the brand mark is a generic stripe rather than the
operator's logo.

The operator wants the poster to telegraph the *kind* of news at a glance through
color, to carry the new **Locked-In** brand wordmark, and — when they stamp a custom
word that isn't one of the ten categories — to still choose a fitting band color from
the brand set rather than being stuck on one default.

## Solution

Reskin the **Final Quote Tweet Image** to the new Figma template and give the **News
Category** a color.

- Each of the ten News Categories owns one **News Category Color**; the headline band
  is tinted with it, the label is centered and white in the **Vina Sans** face, and the
  fixed **Locked-In Logo** sits in the top-left. Everything except the band color and
  the stamp text is identical across every category and every run.
- Picking a category chip sets the label **and** its color together — one click. The
  color of every category is visible at rest as a swatch on its chip, on both editing
  surfaces (the **Selected Run** sidebar and the workspace).
- Stamping a **custom word** (which has no category) reveals a color row: the operator
  picks one of the same ten colors, defaulting to the **VIRAL** color until they choose.
- The preview, the **Run Card**, and the download all recolor live as the operator
  edits. An **Automated Run** needs no extra step — the classifier picks a category and
  the color follows from it.

## User Stories

1. As an operator, I want each News Category to render on its own band color, so that a launch, a firing, and a funding round are distinguishable at a glance.
2. As an operator, I want picking a category chip to set both the stamp text and the band color in one click, so that I don't manage color separately for the common case.
3. As an operator, I want every category chip to show its band color as a swatch even before I pick it, so that I can see the whole category→color mapping at rest.
4. As an operator, I want the color swatches in the News Category section to appear identically in both the Selected Run sidebar and the manual run workspace, so that I never relearn the control between surfaces.
5. As an operator, I want the lit chip to read in its own band color, so that the current selection is obvious.
6. As an operator, I want to stamp a custom word that isn't one of the ten, so that I can label news the vocabulary doesn't cover.
7. As an operator, when I stamp a custom word, I want a color row of the ten brand colors to appear, so that I can choose a band color that fits my custom label.
8. As an operator, I want each custom-label color swatch to name the category it comes from on hover, so that I know which brand color I'm choosing.
9. As an operator, I want a custom label to default to the VIRAL color before I pick one, so that the poster always has a sensible band color.
10. As an operator, I want picking a custom-label color to save immediately, so that my choice persists like every other run edit.
11. As an operator, I want the Final Quote Tweet Image preview to recolor live as I change category or color, so that I see the result before downloading.
12. As an operator, I want the Run Card in the Runs Feed to show the run's band color, so that the feed previews the real poster.
13. As an operator, I want the downloaded image to carry the band color I chose, so that what I post matches what I previewed.
14. As an operator, I want the headline label centered, single-line, and auto-fit so it never truncates, so that even a long category stays whole and legible.
15. As an operator, I want the label rendered in the new Vina Sans face, so that the poster matches the approved brand design.
16. As an operator, I want the Locked-In Logo in the top-left of every Final Quote Tweet Image, so that the poster carries the current brand mark.
17. As an operator, I want the Locked-In Logo to look identical on every category and run, so that the brand mark is consistent.
18. As an operator running an Automated Run, I want the band color to be chosen automatically from the classified category, so that an unattended run reaches a finished, correctly-colored Quote Repost with no input from me.
19. As an operator, I want to override an Automated Run's category afterward and have the band recolor to match, so that correcting the stamp also corrects the color.
20. As an operator, when the News Category classification fails and the stamp falls back to VIRAL, I want the band to show the VIRAL color, so that a failed classification still yields a complete, postable poster.
21. As an operator, I want the band color to stay locked to the category for the ten presets (no separate color control), so that the common path stays a single decision.
22. As an operator, I want the new template to drop the old rainbow stripe, so that the poster reflects the new design rather than the old brand chrome.
23. As an operator, I want the Selected Generated Image to fill the area above the band and fade into it, so that the picture and the colored band read as one composition.
24. As a brand owner, I want the Locked-In Logo held as a single swappable asset, so that a future rebrand is a file change rather than a code or layout change.
25. As an operator, I want a custom label's chosen color to survive reopening the run, so that my edits are durable.
26. As an operator, I want switching from a custom word back to a preset chip to restore that category's own color, so that the band always matches the active stamp.
27. As an operator, I want the new look applied across all runs without retro-compatibility ceremony, so that the internal tool stays simple.

## Implementation Decisions

**New baked template (replaces the old one).** The **Final Quote Tweet Image** layout
module is re-extracted from the new Figma frame (file `BRspEDx97oRutl2hM0NqpP`, category
frames under node `4131`). It keeps the `3240×4050` portrait frame but changes: the
headline band becomes a colored rectangle (`y2997`, height `1053`); the label box is
centered horizontally and vertically within the band; the fade above the band is a CSS
`transparent → band-color` gradient (not a baked bitmap); the image region fills the
area above the band (cover, center); the rainbow stripe and its asset are removed; the
**Locked-In Logo** is added at a fixed top-left rect (`x72 y30`, ~`516×204`).

**Typography.** Label and logo use **Vina Sans** (Regular, uppercase, ≈ −0.02em
tracking), self-hosted via a hand-written `@font-face` exactly as the current bundled
face is registered. VC Henrietta Condensed is removed from this asset (and deleted
outright if nothing else references it). The label is single-line and auto-fits by
shrinking to fit width, never truncating.

**Locked-In Logo asset.** Exported from Figma as an **SVG** with outlined text (so it is
font-independent), committed alongside the other quote-tweet assets, and rendered as one
fixed `<img>` in the composite. Swapping the brand mark later is a file replacement (plus
a size constant if proportions change).

**Color model — one palette, keyed by category.** A closed
`categoryBandColors: Record<NewsCategory, string>` is the single source of truth for the
ten band colors; the label text color is a single white constant (the design needs no
per-category contrast). Band color resolution:

```ts
// Decision shape (not final code):
// preset stamp  -> categoryBandColors[newsCategory]
// custom stamp  -> categoryBandColors[newsCategoryColor ?? "VIRAL"]
function resolveBandColor(newsCategory?: string, newsCategoryColor?: NewsCategory): string
```

**New run field.** The run gains one optional field, `newsCategoryColor?: NewsCategory`,
meaningful only when `newsCategory` is a custom word. It rides the existing JSONB
`payload`, is optional, and is derived-on-read — **no database migration**, mirroring how
`newsCategory` was added in ADR-0027. Presets store nothing extra; their color derives
from the category.

**Composite interface.** `QuoteTweetComposite` gains a `bandColor` prop (the resolved
hex) that replaces today's hardcoded black band. The three consumers — the workspace
overlay, the **Run Card**, and the **Selected Run** sidebar download — each resolve the
band color from the run (via `resolveBandColor`) and pass it through, the same way
ADR-0027 threaded the `label` prop.

**Editing UI.** The shared `NewsCategorySection` (one component used by both the sidebar
and the workspace) is extended: every chip shows a color swatch at rest; the lit chip
reads in its band color; and when the value is a custom word, a "Band color" row of the
ten category colors appears (each swatch tooltip-named by its category), with the active
`newsCategoryColor` highlighted and VIRAL as the default. The section gains one new
callback for the color pick, which each surface routes through its **immediate** save
(the same whole-run save a chip pick uses), not the debounced custom-word path.

**Automated runs.** Unchanged classifier flow: the News Category classifier picks a
category and the color falls out of it on render. Automated runs never set
`newsCategoryColor` (custom labels arise only from manual operator edits), so
compose/fan-out carry no new field beyond what already rides the payload.

**No new boundaries.** No new env var, no new Runtime Readiness Gate boundary, no new
provider call. This is a rendering + persistence change only.

## Testing Decisions

Good tests here assert **external behavior** — the resolved color for a given stamp, the
controls the operator sees and clicks, the durable shape of a saved run — never private
rendering internals (the html-to-image rasterization and the label auto-fit loop stay
untested, as they are today). All seams below already exist; prefer them to new files.

- **Color resolution (`news-category.test.ts`, pure unit).** The highest seam for the
  color logic, alongside the existing `resolveNewsCategory` / `resolveNewsCategoryStamp`
  tests. Assert: `categoryBandColors` has an entry for all ten categories and they are
  distinct; `resolveBandColor` returns the category's color for a preset; returns the
  `newsCategoryColor`'s color for a custom word; falls back to the VIRAL color when a
  custom word has no `newsCategoryColor`; and is unaffected by the label's casing.
- **Baked template (`template.test.ts`, pure unit).** Rewrite the existing geometry
  invariants for the new layout: frame still `3240×4050`; band rect and centered label
  box sit inside the frame and the box inside the band; the gradient fades into the band;
  the Locked-In Logo points at a committed asset and sits in the top-left; the typography
  records Vina Sans; the rainbow stripe is gone.
- **News Category section (`news-category-section.test.tsx`, React Testing Library).**
  Extend the existing role-query tests: every chip renders its color swatch; a preset
  value shows no custom-color row; a custom word reveals the color row defaulting to
  VIRAL; clicking a color swatch invokes the new color callback (immediate save) and not
  the debounced custom-word callback; switching back to a preset hides the row. Follow the
  existing `renderSection` spy-callback prior art.
- **Run schema (`generation-run.test.ts`).** `newsCategoryColor` is optional, round-trips
  through the payload, and is absent for preset and automated runs; a run with a custom
  label and no stored color resolves to the VIRAL color on read.
- **Automated run (`compose-automated-run.test.ts`).** A composed automated run derives
  its band color from the classified category and stores no `newsCategoryColor`.
- **Composite threading (existing consumer tests — `run-card.test.tsx`,
  `final-image-download.test.tsx`, `final-quote-tweet-image-overlay.test.tsx`,
  `workspace-final-quote-tweet-image.test.tsx`).** Each consumer passes the run's resolved
  band color into the composite so the band renders in the category's color; assert at the
  consumer seam (the composite has no direct test today and gains none).

## Out of Scope

- **Retro-compatibility / migration.** This is an internal, single-operator tool. Existing
  saved runs simply re-render against the new template (per ADR-0018's derive-on-demand
  contract); there is no versioning of old posters and no data migration.
- **Per-category text/contrast color.** The design uses white label text on all ten bands;
  no paired foreground color is stored or configurable.
- **Overriding a preset category's color.** Color is the category's identity; only a custom
  word (which has no category) picks a color. There is no per-run recoloring of a preset.
- **Free-form / hex color picking.** The pickable set is exactly the ten category colors;
  no color wheel, no custom hex, no second palette.
- **Per-run or operator-editable Locked-In Logo.** The logo is a fixed, global, build-time
  asset; operators do not change it per run, and swapping it is a developer file change.
- **Changing the classifier.** The News Category classification flow, its failure handling,
  and the closed vocabulary are unchanged (ADR-0027 stands).
- **Changing the Quote Repost composition** beyond the Final Quote Tweet Image (the Run
  Card's tweet chrome, drafts, source tweet embed are untouched).

## Further Notes

- **Asset extraction is a build step inside implementation:** export the Locked-In Logo
  SVG and the Vina Sans face from the Figma already wired via the connected Figma MCP, and
  commit them with the other quote-tweet assets. Remove `rainbow-stripe.png` and (if
  unused elsewhere) the VC Henrietta Condensed face in the same change.
- The ten band colors lean on Tailwind's dark `900/950` shades plus a few brand brights,
  so they sit cleanly in the existing Tailwind v4 palette; they live in
  `categoryBandColors` as the single source of truth (not duplicated into CSS variables).
- A future rebrand is anticipated: the Locked-In Logo is intentionally a swappable asset,
  and the band palette is a single closed map, so both evolve with minimal blast radius.
- Config-style choices (exact asset paths, font filenames) are deferred to the
  implementation issues per the project's planning workflow.
