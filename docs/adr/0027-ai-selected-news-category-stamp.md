---
status: accepted
---

# AI-Selected News Category Stamp

> **Status: extended by [ADR-0029](0029-category-colored-quote-tweet-template-and-locked-in-logo.md).** The News Category now also carries a **News Category Color** — a band color fixed per category and shown as a swatch on every chip. A custom-word stamp picks one via a new optional `newsCategoryColor` field (default VIRAL). The classification, override, and failure model decided here are unchanged.

## Context

Since [ADR-0026](0026-remove-visual-joke-generation.md) emptied the visual-joke
title slot, the headline band of the **Final Quote Tweet Image** has rendered the
fixed literal `LABEL GOES HERE` — not selected, not editable, not persisted. ADR-0026
explicitly considered an editable headline label and rejected it *"for now… the goal
is maximal removal of the joke surface,"* closing with *"Revisit if operators need an
in-tool label."*

Operators need it. The headline band should carry a short stamp naming the *kind* of
tech-news event (a launch, an acquisition, a firing…), chosen automatically so an
unattended automated run still reaches a finished Quote Repost, but correctable
afterward like every other system choice.

## Decision

Introduce **News Category** (run field `newsCategory`): a closed ten-value
classification — `LAUNCHED, DROPPED, ACQUIRED, SIGNED, FIRED, RESIGNED, FUNDED,
PUBLISHED, DRAMA, VIRAL` — rendered as the headline stamp where `LABEL GOES HERE`
used to sit. The vocabulary and its boundary rules (weight separates DROPPED from
PUBLISHED; the stamp follows the source tweet's framing, e.g. the same investment is
ACQUIRED / SIGNED / FUNDED depending on who the tweet frames as the subject; specific
events beat DRAMA; mass layoffs are FIRED) live in `CONTEXT.md`.

- **Classification.** A single, cheap, low-temperature AI Gateway call — *not* a
  three-provider call and with **no Provider Fallback** — reusing an already-configured
  text model (no new `AI_GATEWAY_*_MODEL`, no new Runtime Readiness Gate boundary). It
  reads the **Joke Context Snapshot** (`sourceTweetClaim`, `authorContext`,
  `jokeableTensions`, `supportingFacts`), so it runs after joke context gathering, in
  parallel with text generation, for **both** manual and automated runs. It does not
  steer the drafts. Subject to **No Automatic Retry**; on failure it falls back to
  `VIRAL`.

- **Override model — a single stored value.** `newsCategory` holds the current value
  only: the classifier writes it, an operator edit overwrites it. An override is one of
  the ten or a free custom word, kept as a flat string (a membership check decides
  whether the value lights a chip or fills the custom field). The AI's original pick is
  **not** retained separately — there is no "reset to suggestion," and clearing the
  custom field with no chip selected snaps the value back to `VIRAL`.

- **Failure trace, never a gate.** A classification failure persists a minimal
  failed-state plus debug log, surfaced as a ghost error icon and **Quiet Failure
  Details** (mirroring `failedImageSet`) so it survives reopen and is visible on
  automated runs. But because `VIRAL` always renders, a failure **never** makes a run
  incomplete: classification sits outside the **Successful Run** / **Complete Run**
  criteria, and such runs appear in the Runs Feed normally.

- **Editing UI.** One shared `NewsCategorySection` — ten toggle chips plus a custom
  field — used identically by the Selected Run sidebar and the workspace, the same way
  `DraftComparison` and `ImageSetStack` are shared. It updates the composite live
  through `QuoteTweetComposite`'s existing `label` prop (threaded into all three
  consumers — overlay, Run Card, sidebar download — replacing the constant). Picking a
  chip saves immediately (`saveRunNow`); typing a custom word debounces
  (`scheduleRunAutosave`); custom words render uppercased to match the vocabulary.

- **Automated runs & persistence.** The classifier's pick is the automated default,
  applied with no human and overridable per-operator-copy after fan-out (the value
  rides the copied payload). No database migration: the value lives in the JSONB
  `payload`, and the schema field is optional with a `?? "VIRAL"` fallback on read.

This **amends** ADR-0026 (its rejected "editable headline label" is now adopted),
ADR-0018 (the Final Quote Tweet Image's label is now a dynamic, persisted selection,
not the fixed `LABEL GOES HERE`), and ADR-0023 (the Selected Run sidebar and Run Card
gain a News Category section). It leaves ADR-0021 untouched: **Automated Selection** is
about picking among generated candidates (first draft, first variation); classification
produces a default in *both* run types and is not an automated selection.

## Considered Options

- **Keep the AI pick alongside the override** (suggestion + override, two fields).
  Rejected: the operator wanted to store the chosen value only. The cost we accept is no
  "reset to AI suggestion" and a `VIRAL` snap when a custom field is cleared.
- **A Select dropdown instead of chips.** Rejected: chips show all ten at once, match
  the established click-to-select pattern, and need no new shadcn primitive.
- **Let a classification failure mark the run incomplete** (exclude it from the feed).
  Rejected outright: with a `VIRAL` default the stamp always renders, so a failed
  classification must not cost the operator a finished, postable run.
- **A dedicated, readiness-gated classifier model** (its own env var). Rejected:
  ADR-0026 had just shrunk the config/readiness surface; a step that cannot fail a run
  should neither add a required env var nor block a run from starting.
- **Have the classifier prefer DRAMA on any controversy.** Rejected: specific events
  win, keeping DRAMA a meaningful residual and the precise stamps firing.

## Consequences

- The headline label is no longer a fixed constant: ADR-0018's "not selected, not
  editable, not persisted" no longer holds for this slot. `finalQuoteTweetImageLabel`
  stops being the rendered value (it may remain only as the read-time fallback).
- Two editing surfaces gain the same new section; parity is structural, via the shared
  `NewsCategorySection` and the shared autosave path.
- A new provider call exists outside the Generation Orchestrator's three-provider loop,
  with its own isolated failure state and no retry.
- The vocabulary is closed and lives in code; adding or renaming a stamp is a code +
  glossary change, not configuration.
