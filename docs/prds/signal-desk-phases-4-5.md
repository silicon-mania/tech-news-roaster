# Signal Desk Redesign — Phases 4 & 5

_Finishing the LOCKED IN "Signal Desk" visual system ([ADR-0030](../adr/0030-signal-desk-visual-system.md)). Phases 0–3 shipped on `feat/signal-desk-redesign`; this PRD covers the two deliberately-deferred phases: the Final Quote Tweet Image overlay readiness cue (Phase 4) and the decorative-blue retirement + display-tier finish + motion/containment checks (Phase 5)._

## Problem Statement

Two cohesive pieces of the Signal Desk system are still missing, and the app reads as half-finished because of it.

- **The operator can't tell at a glance whether the Final Quote Tweet Image overlay is actually ready.** They reach for Download and only then discover the run has no Selected Generated Image (the overlay shows a "select a generated image" message), or they download a poster for a run whose Quote Repost isn't complete because no draft has resolved. There's no quiet, ambient "this episode is ready" signal.

- **Blue means two things at once.** Brand-blue is still the generic UI accent (primary buttons, focus/selection rings, the verified ✓ on the Run Card) *and* it is a signal color (the FUNDED News Category). So a blue element is ambiguous — sometimes "FUNDED", sometimes just "interactive" — which directly undercuts the system's premise that *color is the signal*.

- **The type system reads as half-migrated.** The Run Card category word, the masthead, and the workspace section titles use the condensed-italic display tier, but five headers still render in the Henrietta serif (the workspace "Auto-news" masthead, the sidebar headings, sign-in, the direction panel, the final-image download heading), so the app mixes two title voices.

- **New motion and an angular stripe are unverified.** The running-stage pulse and the run-card's skewed signal stripe need confirmation that they degrade under `prefers-reduced-motion` and that the clip-path parallelogram doesn't clip or reflow inside the feed's CSS multi-column masonry.

## Solution

- **A "PROGRAM / STANDBY" on-air readiness indicator on the overlay.** A small signal-color dot on the Final Quote Tweet Image overlay card turns green only when the episode is genuinely ready — a Selected Draft *and* a Selected Generated Image both resolve — so the operator knows before reaching for Download. The collapsed peek is relabeled `PGM` / `STANDBY` to match. It is purely additive chrome on the existing overlay; the matted light card and the composite itself are untouched.

- **Blue becomes a signal-only color.** Brand-blue is retired as the generic UI accent: primary buttons and focus/selection rings move to a neutral, foreground-derived treatment, so the only blue left on screen means FUNDED (via the poster band / `--signal-blue`). The one judgement call — whether the X-style verified ✓ stays blue (faithful to a real X post) or goes neutral (strictest reading of "blue = FUNDED only") — is called out as an open decision with a recommendation.

- **One title voice.** The five remaining Henrietta headers migrate to the condensed-italic display tier, so every title in the app speaks the LOCKED IN display voice.

- **Verified graceful degradation.** The stripe and the scoreboard pulse are confirmed to respect reduced-motion, and the run-card stripe is confirmed not to clip or reflow the masonry.

## User Stories

1. As an operator assembling a Quote Repost, I want a quiet "ready" signal on the Final Quote Tweet Image overlay, so that I know the episode is complete before I reach for Download.
2. As an operator, I want the readiness signal to stay in "standby" until I have both a Selected Draft and a Selected Generated Image, so that I don't download a poster for an incomplete run.
3. As an operator, I want the collapsed overlay peek to read `PGM` / `STANDBY`, so that I can tell at a glance whether the run is ready without expanding it.
4. As an operator, I want the readiness indicator to recompute instantly as I switch drafts or images, so that it always reflects the run's current state.
5. As an operator, I want the readiness indicator to never change the existing collapse / expand / download controls or the print-like look of the overlay, so that nothing about the artifact I'm posting shifts.
6. As a screen-reader user, I want the readiness state announced in words ("program" / "standby"), so that the cue isn't color-only.
7. As an operator reading the feed and workspace, I want blue to mean exactly one thing — the FUNDED News Category — so that color reliably signals meaning rather than mere interactivity.
8. As an operator, I want primary actions (the Run button) and focus rings to be legible and obviously interactive without using brand-blue, so that interactivity reads from shape/weight/contrast, not a color that now carries category meaning.
9. As an operator, I want the verified ✓ on a Run Card to read correctly (either authentically X-blue or cleanly neutral, per the resolved decision), so that the card still looks like a real X post without muddying the signal palette.
10. As an operator, I want every title in the app to share one display voice, so that the workspace masthead, sidebar, sign-in, and section headings feel like one product rather than two.
11. As a maintainer, I want a single source-of-truth palette with no second color system, so that retuning a hue is one code change.
12. As a maintainer, I want a documented call-site audit of every brand-blue usage, so that nothing that relied on "brand blue" silently loses its meaning when blue is reserved for FUNDED.
13. As a maintainer, I want the Henrietta serif removed (or explicitly retained as an alias) once no header references it, so that the font system has no dead tier.
14. As an operator with reduced-motion enabled, I want the stage-scoreboard pulse and any stripe transitions to settle without animation, so that motion never fights my accessibility preference.
15. As an operator on a narrow or wide viewport, I want the run-card signal stripe to never clip, overlap, or reflow the masonry, so that the feed stays clean at every width.
16. As a maintainer, I want ADR-0030, CLAUDE.md, and the font/redesign memory updated in the same change, so that the docs match the finished system rather than the staged plan.

## Implementation Decisions

**Phase 4 — overlay readiness cue**

- The readiness indicator is a **sibling element** on the Final Quote Tweet Image overlay card. It must **not** edit the scoped light-card utilities or the icon-button utilities, must **not** touch `QuoteTweetComposite` / the template geometry / the rasterization path, and must keep the matted white card byte-for-byte — it only adds chrome around it (the constraint ADR-0030 places on the one sanctioned light island).
- "Ready" (green, `--signal-green`) means a **Selected Draft resolves and a Selected Generated Image resolves** for the run; otherwise "standby" (a quiet neutral). The image resolution already exists in the overlay; the draft resolution follows the same resolve-or-first-fallback the Run Card uses.
- The expanded card carries the dot near its top edge; the collapsed peek's label reads `PGM` (ready) / `STANDBY` (not ready). The cue is derived from the run on every render, owns no state, and recomputes as the operator switches drafts/images.
- Accessible: the state is conveyed in text (e.g. an `sr-only` "program" / "standby"), not by color alone.

**Phase 5 — decorative-blue retirement, display-tier finish, motion/containment**

- **Retire brand-blue as the UI accent.** Re-task `--accent` / `--accent-strong` (today `#67c8ff` / `#9bdcff`) and remap `--primary` and `--ring` to a **neutral, foreground-derived** treatment. `::selection` was already neutralized in Phase 1. After this, the only blue on screen is the FUNDED signal, sourced from `categoryBandColors` / `--signal-blue`.
- **Call-site audit (~12 `text-primary` / `bg-primary` / `ring-primary` usages).** Every site is reviewed so nothing silently loses meaning: the primary-button and link variants, the in-flight/selected dots and rings in the generation form, runs list, image-generation area, draft comparison, and uploaded-image article, plus the Run Card's verified tick. Each either follows `--primary`'s new neutral value intentionally or is given an explicit color.
- **Open decision (recommend "keep blue"): the verified ✓.** The Run Card is meant to read as a real X post, where the verified check is blue. Recommendation: keep the tick blue by giving it an **explicit** blue decoupled from `--primary` (so retiring the UI accent doesn't touch it). Alternative: let it go neutral for the strictest "blue = FUNDED only" reading. This is the one contested call and a candidate for a HITL decision when the work is picked up.
- **Migrate the five remaining serif headers to `.display-locked`.** The workspace "Auto-news" masthead, the sidebar "Selected run" + section headings, the sign-in heading, the direction-panel heading, and the final-image-download heading move off `.title-serif` (Henrietta) to the condensed-italic display tier. Once nothing references `.title-serif`, decide whether to delete the class and drop the Henrietta `@font-face`, or keep it as an alias.
- **Reduced-motion.** Confirm the stage-scoreboard running pulse and any stripe transition are neutralized by the existing `prefers-reduced-motion` block in the global stylesheet; add an explicit guard only if they are not.
- **Masonry containment.** Confirm the run-card leading signal stripe (a clip-path parallelogram) does not clip, overlap a neighbour, or trigger reflow across the feed's `break-inside-avoid` CSS multi-column at narrow and wide widths.
- **Docs.** Update ADR-0030 (mark these phases landed; record the verified-tick decision and the Henrietta outcome), CLAUDE.md (the blue-is-FUNDED-only rule; the display tier now styles all titles), and the font/redesign memory, in the same change.

## Testing Decisions

Good tests assert **external behaviour**, not implementation: the readiness cue's state given run inputs, the verified-account markup, that headings are findable by accessible name after a font swap (text content, not font). Token/color values and visual motion have no meaningful unit seam in this repo (there are no CSS-variable-value tests, by design); those are verified by a manual/screenshot pass and called out as such.

- **Phase 4 — extend the existing overlay test seam** (the highest existing seam: the overlay component test that already covers collapse / expand / the missing-image message). Add cases: the indicator reads **standby** when neither, or only one, of Selected Draft / Selected Generated Image resolves; reads **program** (and is green) when both resolve; the collapsed peek shows `PGM` / `STANDBY` accordingly; and the existing collapse/expand/download controls and the light-card markup are unchanged (the cue is strictly additive).
- **Phase 5 — cover the testable bits, name the untestable ones.** The Run Card test continues to assert the verified-account markup; if the tick stays blue, it asserts the tick carries its explicit blue (not `--primary`). The section-header / sidebar / masthead header tests continue to find headings by accessible name after the `.title-serif` → `.display-locked` swap (text content is unchanged, so they pass without edits). The neutral-primary appearance, reduced-motion behaviour, and masonry non-clipping have **no automated seam** — they are verified manually/by screenshot and noted in the issue so the gap is explicit, not silent.
- **Prior art:** `final-quote-tweet-image-overlay.test.tsx` (overlay states), `run-card.test.tsx` (verified-account + signal-word), `news-category-section.test.tsx` (monochrome-chips behaviour from Phase 3), `stage-scoreboard.test.tsx` (the pure-derive + render pattern for the new control-room component).

## Out of Scope

- Phases 0–3 (already shipped: tokens + Run Card, feed chrome, workspace surfaces).
- Any change to the X Quote Repost composite, the template geometry / 4:5 frame, the auto-fit label, or the rasterization path — load-bearing and untouched (ADR-0018/0029/0030).
- The light overlay card's own theme — Phase 4 adds only a sibling indicator; the matted white card stays as-is.
- Adding realtime/polling to the Runs Feed; introducing any new color variables beyond the established `--signal-*`.
- Re-opening the monochrome-chip / at-rest-swatch decision from Phase 3.
- Deleting the Henrietta font asset is optional cleanup, gated on there being no remaining `.title-serif` reference; it is not required for the phase to land.

## Further Notes

- Work continues on `feat/signal-desk-redesign`; each phase has shipped as a single commit. Phases 4 and 5 are independent of each other and can land in either order (Phase 4 touches only the overlay; Phase 5 is a cross-cutting token/type pass).
- **Verification caveat:** the dev server uses live, paid APIs and the local preview is auth-gated, so visual verification is manual/limited — rely on the unit seams above plus a screenshot pass when the work is picked up. This is why Phase 5's visual changes are explicitly flagged as having no automated seam.
- **Open decisions to resolve when picked up** (candidates for a HITL issue): (1) the verified-tick fate — keep X-blue (recommended) vs neutral; (2) whether to delete `.title-serif` + the Henrietta `@font-face` outright once unreferenced, or keep the class as an alias.
