---
status: accepted
---

# Runs Feed Landing and Selected Run Sidebar

> **Status: amended by [ADR-0026](0026-remove-visual-joke-generation.md).** Visual jokes have been removed. The Selected Run sidebar and Run Card carry no visual joke slot or Joke-Title editing: the sidebar switches the selected draft and the selected generated image, and a Run Card's two slots are the first draft and the first generated variation. A Complete Run is now a draft plus an image variation. The Context below is kept as the original record; the Runs Feed landing page and Selected Run sidebar decision otherwise stands.

> **Status: amended by [ADR-0027](0027-ai-selected-news-category-stamp.md).** The Selected Run sidebar and Run Card now also carry a **News Category** section — ten toggle chips plus a custom field — sharing a component and the autosave path across the sidebar and workspace exactly as the draft and image sections do. The landing-page-and-sidebar decision otherwise stands.

## Context

The workspace (`workspace.tsx`, mounted at `/`) is the product's landing page: a
single Active Run shown in the center, past runs reached through a left
hover-peek sidebar (`runs-sidebar.tsx` / `runs-list.tsx`), with the Selected
Draft, Selected Visual Joke, and Selected Generated Image chosen inline. The
product never shows a faithful preview of the Quote Repost a run becomes — the
closest surface is the Final Quote Tweet Image overlay — so the operator cannot
browse finished runs as the posts they will be. Visual jokes are non-editable.
Meanwhile automated runs accrue server-side every two hours (`vercel.json` cron
`0 */2 * * *`), and the operator's primary job is to browse, refine, and post
those Quote Reposts rather than to generate one at a time.

## Decision

The Runs Feed becomes the product's landing page at `/`: the operator's Complete
Runs, newest-first, as an infinite-scrolling list (14 per page) of Run Cards.
Each Run Card is a faithful X quote-repost mock — fixed Operator Account header
(Silicon Mania / @siliconmania), the Selected Draft as commentary, the Final
Quote Tweet Image as media, and the Source Tweet embedded as the quoted post,
with static engagement chrome — and shows the run's generated time and the
source tweet's posted time.

Selecting a card opens the Selected Run right sidebar over the feed: the full
editor for an existing run. There the operator switches the selected draft
and image variation and inline-edits the selected draft's text — every change
persisted with no save button, the card updating instantly. The sidebar is the complete editor;
an existing run never needs the center workspace.

The center workspace (`workspace.tsx`) is preserved unchanged for manual, live
generation and is reached from the feed by an icon-only New Manual Run button; a
thin route wrapper adds a "back to Runs" link without modifying the component.
The draft and image section components and the autosave path are shared so the
workspace and sidebar behave uniformly.

## Considered Options

- **Unify into one surface** that both generates and edits through the feed and
  sidebar, retiring `workspace.tsx`. Rejected: the manual-generation flow (SSE
  streaming, the Image Original Candidate selection gate, the Runtime Readiness
  Gate, the Direction Panel) is intricate and working; rebuilding it to share a
  single surface risks destabilizing it for a UX gain the sidebar already
  delivers. We accept two editing surfaces backed by shared components instead.
- **Keep the workspace as the landing page and add the feed as a secondary
  route.** Rejected: the operator's primary need is to browse and post past
  Quote Reposts — especially as automated runs pile up unattended — so the feed
  is the right landing and generation is the on-demand action.
- **Make the sidebar light touch-ups only, with deep re-selection back in the
  workspace.** Rejected by the operator: the sidebar must be the complete editor
  for existing runs, so the workspace is only ever the live-generation surface.

## Consequences

- Two surfaces can edit a run (workspace inline editing and the Selected Run
  sidebar). We keep them consistent by sharing the draft and image section
  components and the autosave path (`useRunAutosave`, `httpSavedRunStore`).
- The feed shows only Complete Runs (at least one draft and one generated image
  variation). Successful-but-incomplete runs are excluded from the feed but stay
  in the workspace's runs sidebar for inspection or deletion. With No Automatic
  Retry, a run whose image generation failed never reaches the feed.
- No realtime. New cards — finished manual runs and background automated runs —
  appear on feed mount or via an explicit Refresh action that re-fetches and
  toasts how many arrived. A background automated run that completes while the
  operator sits on the feed stays invisible until the next refresh. Accepted to
  avoid building a streaming/subscription layer now; a server-side in-flight
  count would be its own future decision.
- Defaults are display-only: each Run Card resolves the operator's explicit
  choice or the first of each (first draft, first variation, per
  Automated Selection / [ADR 0021](0021-single-image-set-and-automated-selection.md)).
  Nothing is persisted until the operator makes a real edit, so scrolling the
  feed triggers no writes and a run reopens exactly as it was left.
- Active Run and Single-Page Workspace no longer describe the landing page, and
  the left runs sidebar survives only inside the now-secondary workspace; the
  glossary in `CONTEXT.md` is updated accordingly (Runs Feed, Run Card, Selected
  Run, Complete Run; Quote Tweet renamed to Quote Repost).
