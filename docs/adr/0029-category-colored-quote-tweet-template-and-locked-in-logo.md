---
status: accepted
---

# Category-Colored Quote Tweet Template and Locked-In Logo

> **Amended by [ADR-0030](0030-signal-desk-visual-system.md).** CompactaICG is
> promoted from this asset's label face to a general UI display tier
> (`.display-locked`); the "VC Henrietta Condensed is kept as the section-title
> serif" note below is now staged for migration to that tier.

## Context

The **Final Quote Tweet Image** is rendered from a baked layout extracted from
Figma ([ADR-0018](0018-deterministic-derived-final-quote-tweet-image.md)): a fixed
black band holding the headline stamp, a left-aligned **VC Henrietta Condensed**
title, and a rainbow brand stripe pinned to the top edge. [ADR-0027](0027-ai-selected-news-category-stamp.md)
filled that band with the **News Category** stamp — a closed ten-value
classification, AI-picked and operator-overridable.

A new Figma template (file `BRspEDx97oRutl2hM0NqpP`, section node `4131:226`, one
frame per category) reskins the asset. The structure is identical across all ten
cards except for one thing: the band's color. Each News Category now reads on a
**band tinted with its own color**; the headline label is **centered, single-line,
white**, in a new face (**CompactaICG Italic**); the rainbow stripe is gone; and a fixed
top-left wordmark — **"LOCKED-IN"** — replaces it as the brand mark.

This is an **internal, single-operator tool**: there is no retro-compatibility
requirement. Existing saved runs are expected to re-render against the new
template, and that is acceptable.

The product also needs the operator to *see* which color belongs to each category,
and — when they enter a **custom-word** stamp that has no category — to pick a band
color themselves.

## Decision

Replace the baked template and give **News Category** a color dimension.

- **New baked template (from Figma `4131`).** Same `3240×4050` portrait frame. The
  headline band (`fill-rectangle`) is `x0 y2997 w3240 h1053`; the label
  (`news-category`) is **horizontally and vertically centered** in the band, **one
  line**, auto-fit (shrink-to-fit, never truncate), **white**. The image fills the
  region above the band (cover, center). The fade above the band (`Rectangle 124`,
  `y2186 h811`) is reproduced as a CSS `transparent → band-color` gradient — the
  same technique the old template already used — rather than a baked per-category
  gradient bitmap. The rainbow stripe and its `rainbow-stripe.png` asset are
  removed.

- **Font.** The label uses **CompactaICG** (Compacta ICG Italic, weight 500,
  ≈ −0.02em tracking), self-hosted via a hand-written `@font-face` exactly as the
  current faces are bundled. VC Henrietta Condensed is dropped from this asset but
  **kept** as the app's editorial section-title serif (`.title-serif`, which still
  uses it). _(Amended in slice 004: the label face was originally specced as Vina
  Sans and changed to CompactaICG Italic during implementation — a deliberate design
  change, the template being expected to keep evolving. Vina Sans was not retained.)_

- **Locked-In Logo.** The top-left wordmark is treated as a **brand logo, not text**
  — committed as a single **SVG** asset pinned at the fixed rect (`x72 y30`, ~`516×204`)
  and rendered as one `<img>`, identical for all ten categories. It is exported with
  outlined text, so it carries its own shape and does not depend on any font
  loading. This is the first version of the Locked-In mark; a future rebrand is
  a **file swap** (+ a size constant if proportions change), never a composite edit.

- **Color model — derived for presets, picked for custom.** A closed
  `categoryBandColors: Record<NewsCategory, string>` is the **single source of
  truth** for the ten band colors (mirroring how `newsCategories` is the one
  vocabulary tuple). The band color resolves as:
  - **Preset stamp** (`newsCategory` is one of the ten): band = `categoryBandColors[newsCategory]`.
    The category *is* the color; nothing extra is stored.
  - **Custom-word stamp** (`newsCategory` is free text): band =
    `categoryBandColors[newsCategoryColor ?? "VIRAL"]`, where **`newsCategoryColor?:
    NewsCategory`** is a new optional run field naming *which category's color* the
    operator picked, defaulting to **VIRAL** so a custom label always has a color.

  The label text is always white — the design needs no per-category foreground, so
  no paired contrast color is stored.

- **Editing UI.** The shared `NewsCategorySection` (used identically by the Selected
  Run sidebar and the workspace) shows a **color swatch on every chip at rest**, so
  the category↔color mapping is always visible on both surfaces; the lit chip reads
  in its band color. When a custom word is typed (no chip lit), a **"Band color" row**
  of the same ten colors appears (tooltip = category name), the chosen
  `newsCategoryColor` highlighted, default VIRAL; picking a swatch saves immediately,
  like picking a chip. `QuoteTweetComposite` gains a **`bandColor`** prop (the
  resolved hex), replacing the hardcoded black band, threaded into all three
  consumers — overlay, Run Card, sidebar download — the way ADR-0027 threaded `label`.

- **Automated runs & persistence.** No new logic: the classifier picks a category and
  the color falls out of it; custom labels only ever arise from manual operator edits.
  `newsCategoryColor` rides the JSONB `payload`, optional, derived-on-read — **no
  migration, no new env var, no new Runtime Readiness Gate boundary**.

This **amends** ADR-0018 (the baked template is replaced; the rainbow stripe becomes
the Locked-In Logo; the title face changes) and **extends** ADR-0027 (the News
Category now also carries a News Category Color, with one new run field for the
custom-label case).

## Considered Options

- **Store a raw hex (or a standalone color-name enum) instead of a category key.**
  Rejected: the pickable set *is* the ten category colors, so a separate value is a
  second color system (CLAUDE.md's cardinal rule) and a future palette tweak would
  have to migrate stored hexes. Keying by `NewsCategory` keeps one source of truth.
- **A separate pickable palette, distinct from the category colors.** Rejected: same
  duplication; the brand palette and the category colors are the same ten.
- **Render the Locked-In wordmark as live Vina Sans text.** Rejected: it is a brand
  logo that *will* be rebranded; a committed swappable asset makes that a file change,
  and an outlined SVG is font-independent and crisp at the 2× rasterization.
- **Let an operator override a preset category's color.** Rejected: the color is the
  category's identity; only a custom word (which has no category) picks one.
- **Keep the old template / version old runs for retro-compatibility.** Rejected
  outright: this is an internal tool, the Final Quote Tweet Image is derive-on-demand
  (ADR-0018), and re-skinning old runs against the new template is acceptable.

## Consequences

- `QuoteTweetComposite` is no longer a fixed black band; it takes a `bandColor` and
  the band/gradient/label/logo all derive from the new template module.
- One new optional run field, `newsCategoryColor`, meaningful only for custom-word
  stamps; presets derive their color and store nothing.
- New committed assets: the Locked-In Logo SVG and the CompactaICG Italic font face.
  Removed: `rainbow-stripe.png`. VC Henrietta Condensed is kept — it remains the
  app's editorial section-title serif.
- Every existing saved run re-renders against the new template on next open/download;
  an old custom-label run shows the VIRAL color until edited. This is accepted.
- Adding or retuning a band color is a code change in `categoryBandColors` — closed
  and code-owned, like the vocabulary itself, not configuration.
