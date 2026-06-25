---
status: accepted
---

# Signal Desk Visual System — Silent Canvas, Signal Tokens, Condensed-Italic Display Tier

## Context

The app inherited a generic dark-editorial skin: a near-black background washed
with an always-on accent-blue gradient and faint vertical pinstripes, a cyan
`--accent` used as the one decorative color, and **VC Henrietta Condensed** as the
section-title serif. Meanwhile the product's signature output — the **Final Quote
Tweet Image** ([ADR-0029](0029-category-colored-quote-tweet-template-and-locked-in-logo.md))
— already speaks a different, sharper language: a heavy condensed italic face
(**CompactaICG**) and a per-**News Category** band color. A brand "visual guide"
("LOCKED IN") names that language explicitly: *black and white are the brand,
color is the signal*; heavy/condensed/italic display type; a six-hue signal palette
carrying meaning; graphic-first, declarative, broadcast energy.

Two facts made adoption low-risk and obvious:

1. `categoryBandColors` (the source of truth in `news-category.ts`) already
   collapsed to the **six** LOCKED IN signal hexes across the ten categories (commit
   "Change colors"). The color taxonomy the brand prescribes already lives in the
   code — it just never reached the UI chrome, only the poster band.
2. CompactaICG is already bundled and `@font-face`-registered; the brand's display
   voice is one CSS class away.

The redesign was explored as four directions (broadcast control room, editorial
newsprint, signal-minimal, sports-network HUD) and judged by three lenses
(UX-pragmatist, brand-purist, repo-engineer). **Signal Minimal** won unanimously:
its core idea *is* the existing constraints (minimalist, avoid borders, one palette,
dark-only) rather than chrome layered on top.

## Decision

Adopt **"Signal Desk"** as the app's visual direction and land it as a thin tracer
slice (this ADR + the Run Card + the tokens), staging the rest.

- **Silent canvas.** `--background` flattens to brand black `#0a0a0a`; the `body`
  accent-blue gradient wash and the vertical pinstripe are **removed**. The page is
  silent neutral type on near-black so the only color on screen is a run's signal —
  its card stripe and the X Quote Repost poster.

- **One color system — named signal tokens.** Add `--signal-green` `#6acb3c`,
  `--signal-yellow` `#ffc20e`, `--signal-orange` `#ff7a1a`, `--signal-red`
  `#e63946`, `--signal-purple` `#9c27b0`, `--signal-blue` `#1ea7f0`, exposed in
  `@theme inline` as `--color-signal-*` for static utilities. These **mirror**
  `categoryBandColors`, which stays the authoritative source for per-run band colors
  (no second palette, per CLAUDE.md). The semantic **status** tokens are reconciled
  onto the same hues — `--success` → green, `--warning` → yellow, `--danger` → red —
  so run-state color and category color are one system.

- **Color is a hint, never a unique key.** Six hues map to ten categories
  (RED = SIGNED/FIRED/RESIGNED, GREEN = DRAMA/VIRAL, PURPLE = LAUNCHED/DROPPED), so
  the category **word** always accompanies the color. The Run Card prints the word
  beside its stripe; the composite stamps it on the band. (This corrects a now-stale
  test that asserted "ten distinct colors.")

- **Condensed-italic display tier.** Promote CompactaICG from composite-label-only
  to a UI display class: `--font-display` + `.display-locked` (heavy condensed
  italic, all-caps). Used for UI "signal words" — first use is the Run Card's News
  Category label.

- **Run Card reskin (the tracer).** Drop the `rounded-xl bg-card` panel and the
  embedded-tweet full border; the card becomes a borderless type block with a single
  angular `SignalStripe` (a new feature-shared primitive) on the left flying the
  run's News Category Color — the **same hex** the composite bands with. At rest the
  stripe is low-alpha; on hover/focus it lifts to full saturation, replacing the
  near-invisible `hover:bg-foreground/[0.03]` as the click affordance. The embedded
  Source Tweet becomes a `border-left` pull-quote; the footer becomes a small-caps,
  letter-spaced caption above a single hairline rule (the one sanctioned `--line`
  use). The hardcoded fake engagement counts (18 / 7 / 124 / 12.4K) — which
  masqueraded as data on every identical card — are **dropped**.

- **`::selection`** moves off accent-blue to a neutral foreground tint.

### Staged (explicitly deferred from this slice)

- **Repointing `.title-serif` from Henrietta to the display tier** (masthead +
  section headers). The display tier is introduced now; section titles migrate when
  the masthead/section-header surfaces are reworked.
- **Retiring blue from `--primary` / `--ring` / the verified tick.** Reserving blue
  strictly for the FUNDED signal means remapping app-wide accent usages (buttons,
  links, focus rings) — a call-site audit kept out of this tracer. The verified
  BadgeCheck stays blue for now (a real X post's check is blue).
- **Masthead wordmark + signal bug, derived status readout, sidebar handoff stripe,
  Workspace stage scoreboard, overlay readiness dot** — later phases.

This **amends** [ADR-0029](0029-category-colored-quote-tweet-template-and-locked-in-logo.md):
CompactaICG is now a general UI display face, not composite-label-only; the
"Henrietta is kept as the section-title serif" note is now staged for migration
(the workspace `SectionHeader` titles already use the display tier); and the News
Category chips drop their at-rest color swatch (ADR-0029 "Editing UI") — chips are
monochrome at rest, lighting their color only on the selected chip. The custom-word
"Band color" row keeps its swatches, and the lit chip still fills with its color.
The **load-bearing** artifact is untouched: `QuoteTweetComposite`, `template.ts`
geometry (3240×4050), the auto-fit label, rasterization, and the sanctioned light
overlay are unchanged.

## Considered Options

- **Editorial Newsprint (full light inversion).** The most brand-faithful to the
  guide pages (cream paper, black ink), but it reverses the documented dark-only
  rule, forces re-auditing every `dark:` utility and ghost-button hover state, and
  strands the one sanctioned light island. Rejected: a whole-app reskin milestone
  for UX wins the dark direction delivers nearly for free.
- **Broadcast ticker / always-on live status rail.** Rejected: the Runs Feed renders
  only Complete Runs and never polls; in-flight phase state lives only in the
  Workspace. A "live" rail on the feed would over-promise realtime that does not
  exist. (The honest live surface — a Workspace stage scoreboard — is deferred to a
  later phase where phase data genuinely exists.)
- **A second decorative palette / new color variables.** Rejected: CLAUDE.md's
  cardinal rule. The signal tokens mirror the authoritative `categoryBandColors`.

## Consequences

- One flat near-black canvas; no decorative gradient. A new `SignalStripe` primitive
  (`src/components/signal/`) owns the angular shape and at-rest/lit states, reused by
  the sidebar and Workspace in later phases.
- Status colors shift hue (success/warning/danger now ride the signal palette);
  visible in the Workspace status messages — intended, on-brand, reversible.
- Near-monochrome legibility leans entirely on whitespace and type hierarchy;
  spacing discipline is non-negotiable.
- The display tier exists; section titles still render in Henrietta until the staged
  migration. CLAUDE.md's token list and the font-system memory are updated to match.
- Adding or retuning a signal hue remains a code change in `categoryBandColors` (the
  `--signal-*` vars mirror it), closed and code-owned.
