---
status: accepted
---

# Remove Visual Joke Generation

> **Status: amended by [ADR-0027](0027-ai-selected-news-category-stamp.md).** The "editable headline label" rejected below under Considered Options is now adopted: the Final Quote Tweet Image no longer renders the fixed `LABEL GOES HERE` but a **News Category** stamp — a closed ten-value classification, AI-selected by default and operator-overridable. The removal of visual jokes otherwise stands; News Category is a lightweight classification, not a return of the visual-joke surface.

## Context

A Generation Run used to produce three things: text drafts, a Visual Joke Set
(three sections of up to seven jokes plus the model's Top Picks, per the now-deleted
ADR 0022), and image variations. The Final Quote Tweet Image placed the Joke Title
of the Selected Visual Joke over the Selected Generated Image
([ADR 0018](0018-deterministic-derived-final-quote-tweet-image.md)). Visual jokes
carried their own provider-agnostic service (the now-deleted ADR 0017), a
system-owned direction prompt, a dedicated `AI_GATEWAY_VISUAL_JOKE_MODEL`, an
automated-selection default (first Top Pick, per
[ADR 0021](0021-single-image-set-and-automated-selection.md)), a slice of the
runtime readiness gate ([ADR 0015](0015-joke-context-gathering-and-image-discovery-split.md)),
and selection plus inline Joke-Title editing across the workspace and the Selected
Run sidebar ([ADR 0023](0023-runs-feed-landing-and-selected-run-sidebar.md)).

For this internal tool the visual-joke surface is not carrying its weight: the joke
service, direction prompt, set/section/Top-Pick model, selection-and-edit UI, and
its share of the readiness gate are ongoing cost without enough return. The headline
band of the Silicon Mania layout will carry a fixed placeholder instead.

## Decision

A Generation Run is now exactly two creative result areas: **Text Generation**
(unchanged — three drafts from the Joke Context Snapshot and User's Direction) and
**Image Generation** (unchanged). Everything visual-joke is removed: visual joke
generation, the Visual Joke Set / Sections / Top Picks, the Selected Visual Joke,
Joke Title editing, the Visual Joke Direction, the visual joke service, the humor-
standard vocabulary that lived only in the direction prompt, and the
`AI_GATEWAY_VISUAL_JOKE_MODEL` environment variable.

The **Final Quote Tweet Image** keeps the deterministic, derive-on-demand
composition of [ADR 0018](0018-deterministic-derived-final-quote-tweet-image.md) but
now takes a **single selection input** — the Selected Generated Image — and renders
a fixed placeholder label, the literal string `LABEL GOES HERE`, where the Joke
Title used to go. The label is not selected, not editable, and not persisted. The
overlay mounts as soon as the run has a completed image set and a selected variation.

**Joke Context Gathering** and its **Joke Context Snapshot** survive unchanged. They
remain the shared understanding layer, now consumed only by text generation. The
name "joke context" is retained — the product is a roaster and its drafts are still
jokes.

This **supersedes** ADR 0017 and ADR 0022 (both deleted: their visual-joke service
and visual-joke-set decisions no longer have a subject). It **amends** ADR 0011
(visual joke generation drops out of the live-boundaries list), ADR 0015 (the
shared understanding layer now feeds text generation only; visual joke generation
drops out of runtime status and the readiness gate), ADR 0018 (one selection input
plus a fixed label), ADR 0021 (automated selection no longer picks a visual joke),
and ADR 0023 (the Selected Run sidebar and Run Card carry no visual joke slot or
Joke-Title editing; a Complete Run is a draft plus an image variation).

## Considered Options

- **Keep an editable headline label** (a free-text field on the run defaulting to
  "LABEL GOES HERE", inline-edited like a draft). Rejected for now: the goal is
  maximal removal of the joke surface. A fixed placeholder leaves no per-run label
  state, editor, API surface, or persisted field, and the real headline is applied
  downstream (e.g. in the export / Figma layout). Revisit if operators need an
  in-tool label.
- **Keep visual jokes but drop the sections and Top Picks.** Rejected: the operator
  wants the notion gone entirely, not simplified.
- **Rename "Joke Context" to plain "Context".** Rejected: it is a large mechanical
  rename of a shared boundary that is not visual-joke-specific, and the drafts are
  still jokes, so the name stays accurate.

## Consequences

- Every run's Final Quote Tweet Image reads "LABEL GOES HERE" until the real
  headline is added outside the tool. Accepted.
- A **Complete Run** is now a draft plus an image variation (two slots, not three);
  a successful-but-incomplete run is one whose image generation failed or never ran.
  Runs Feed eligibility narrows accordingly.
- The runtime readiness gate no longer requires a visual joke model — one fewer
  service boundary must be configured before a run can start.
- **No data migration.** The database is treated as empty (internal tool), so removal
  carries no back-compat for runs that stored a Visual Joke Set. The migration
  history is consolidated into a single fresh init migration as part of this change.
