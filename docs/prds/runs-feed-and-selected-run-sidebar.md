# Runs Feed and Selected Run Sidebar

> Reworks the product's main surface so the operator browses every finished run
> as the Quote Repost it will become, and refines any run in place. Scope:
> desktop only. Companion decision: [ADR 0023](../adr/0023-runs-feed-landing-and-selected-run-sidebar.md).
> Vocabulary: [CONTEXT.md](../../CONTEXT.md).

## Problem Statement

The operator can only look at one run at a time. The workspace opens a single
Active Run in the center, and every past run is tucked into a left hover-peek
sidebar as a terse list row — a label, a relative date, a status dot. To decide
whether a finished run is worth posting, the operator has to reopen runs one by
one and assemble in their head what the published Quote Repost will actually look
like: which draft reads best as the commentary, which visual joke sits on the
image, how the whole thing reads above the quoted Source Tweet. There is no
single place to see all of their finished work at a glance, laid out as the posts
they will become.

This gets worse over time. Automated Runs land every two hours from the Discovery
Source while the operator is away, so finished Quote Reposts pile up — and the
one-at-a-time review in the workspace is the bottleneck for getting them posted.
Worse, the only way to refine a finished run — pick a stronger draft, swap the
visual joke, fix a clumsy word in the title — is to drive the full generation
workspace, which is built for making a *new* run, not for quickly tidying an
existing one.

## Solution

The operator lands on the **Runs Feed**: every **Complete Run** they own, newest
first, each shown as a **Run Card** that faithfully previews the **Quote Repost**
it will become — the fixed Silicon Mania header, the **Selected Draft** as
commentary, the **Final Quote Tweet Image** as media, and the **Source Tweet**
embedded as the quoted post, with "generated X ago" and "original tweet posted Y
ago" beneath. Scrolling loads more cards.

Clicking a card opens the **Selected Run** sidebar over the feed. The selected
card stays visible and updates **instantly** as the operator works: switch the
selected draft, switch or rewrite the visual joke's Joke Title, switch the image
variation, and fix the commentary text — all in place, with **no save button**.
Every change persists, so reopening the app shows each run exactly as the operator
left it.

Starting a brand-new **Manual Run** is one icon-only **`+`** button that opens the
unchanged generation workspace; a back link returns to the feed. The feed is the
home for reviewing, refining, and posting finished work; the workspace is just
where new runs are born. When the operator has no Complete Runs yet, the feed
explains that Quote Reposts also generate automatically every two hours from their
Discovery Source X Lists, with a link to each list.

## User Stories

1. As the operator, I want the app to open on a feed of all my finished runs, so that I see my whole body of work without reopening runs one at a time.
2. As the operator, I want each finished run rendered as a faithful X quote-repost card, so that I can judge it as the post it will become rather than as a list row.
3. As the operator, I want my runs ordered newest-first, so that the work I just produced (or that just generated automatically) is at the top.
4. As the operator, I want the feed to load more runs as I scroll, so that I can browse my full history without pagination clicks.
5. As the operator, I want only Complete Runs in the feed, so that every card is a real, postable Quote Repost and not a half-finished one.
6. As the operator, I want a run whose image generation failed or never ran to stay out of the feed, so that the feed isn't cluttered with cards that can't be posted.
7. As the operator, I want incomplete-but-successful runs to still be reachable in the workspace's runs sidebar, so that I can inspect or delete them even though they're not in the feed.
8. As the operator, I want each card to show the Silicon Mania account header (name, handle, avatar, verified badge), so that the card reads like our real account posting it.
9. As the operator, I want the card's commentary to be the run's Selected Draft, so that I see the exact text that will sit above the image.
10. As the operator, I want the card's image to be the Final Quote Tweet Image (chosen image variation with the chosen Joke Title on it), so that I see the finished media.
11. As the operator, I want the original Source Tweet embedded inside the card as the quoted post, so that the card mirrors a real Quote Repost on X.
12. As the operator, I want decorative engagement chrome (reply/repost/like/view counts, action icons) on the card, so that the preview looks like a genuine post.
13. As the operator, I want "generated X ago" under each card, so that I know how fresh the run is.
14. As the operator, I want "original tweet posted Y ago" under each card, so that I know how timely the underlying news is before I post.
15. As the operator, when a run has no explicit selection, I want the card to default to the first draft, the first Top Pick visual joke, and the first generated variation, so that every card always shows a complete Quote Repost.
16. As the operator, I want a run to appear in the feed as soon as all three pieces (a draft, a visual joke, an image variation) exist, so that I don't wait on selections I haven't made.
17. As the operator, I want clicking a card to open a Selected Run sidebar over the feed, so that I can refine the run without leaving the feed.
18. As the operator, I want the selected card to stay visible while its sidebar is open, so that I can watch my edits land on the actual preview.
19. As the operator, I want every edit in the sidebar to reflect on the card instantly, so that the card is the live preview and there's no separate preview pane.
20. As the operator, I want a compact Source post reference at the top of the sidebar, so that I have the original context while I edit.
21. As the operator, I want clicking that Source post to open the original tweet on X in a new browser tab, so that I can check the source without losing my place in the feed.
22. As the operator, I want a Text section in the sidebar listing the run's drafts, so that I can compare and choose a different commentary.
23. As the operator, I want to switch which draft is selected, so that I can pick the strongest commentary for the post.
24. As the operator, I want to edit the selected draft's text in place, so that I can fix wording before posting.
25. As the operator, I want each draft's provider and model shown, so that I know which model produced which option.
26. As the operator, I want a Visual jokes section grouped into Satire, Tech-Positive, and Experimental, so that I can browse jokes by who they punch at.
27. As the operator, I want Top Picks flagged in the jokes list, so that I can find the model's strongest options quickly.
28. As the operator, I want to switch which visual joke is selected, so that I can change the Joke Title that sits on the Final Quote Tweet Image.
29. As the operator, I want the Final Quote Tweet Image to update the moment I switch the selected joke, so that the card always reflects the chosen title.
30. As the operator, I want to rewrite the selected joke's title text in place, so that I can sharpen or fix the headline before posting.
31. As the operator, I want my rewritten title to overwrite that joke within this run, so that the change sticks to this run the same way an edited draft does.
32. As the operator, I want an Image section showing the run's image set, so that I can choose which generated picture goes on the post.
33. As the operator, I want to switch among the four generated variations, so that I can pick the best image for the Quote Repost.
34. As the operator, I want image switching limited to the four variations (no regeneration, no changing the image original, no prompt), so that the sidebar stays a quick editor and heavy image work stays in the workspace.
35. As the operator, I want the sidebar to scroll, so that I can reach every draft, joke, and variation even when there are many.
36. As the operator, I want no "save" button anywhere in the sidebar, so that I never wonder whether my changes were kept.
37. As the operator, I want my edits saved automatically as I make them, so that closing the sidebar or the app never loses work.
38. As the operator, I want my explicit selections and edits to survive a reload, so that I always return to each run exactly as I left it.
39. As the operator, I want a run I only ever viewed (never edited) to still show the same first-of-each defaults next time, so that nothing silently changes between sessions.
40. As the operator, I want to delete a run from inside its sidebar, so that I can remove a weak run while reviewing it.
41. As the operator, I want a quiet confirmation when I delete, so that I get feedback without a blocking dialog.
42. As the operator, I want delete kept out of the card itself, so that I don't remove a run by accident while scrolling and clicking to select.
43. As the operator, I want a `+` button at the top of the feed, so that I can start a new Manual Run.
44. As the operator, I want that button to be an icon with a "New Manual Run" tooltip, so that it stays consistent with the app's quiet, icon-first actions.
45. As the operator, I want the `+` button to open the existing generation workspace unchanged, so that starting a run works exactly as it does today.
46. As the operator, I want a "back to Runs" link from the workspace, so that I can return to the feed after starting or finishing a run.
47. As the operator, when I finish a Manual Run in the workspace and return to the feed, I want its new card at the top, so that I can immediately review what I just made.
48. As the operator, I want a Refresh button on the feed, so that I can pull in runs that finished after I loaded the page.
49. As the operator, I want Refresh to tell me how many new runs arrived, so that I know something landed without a persistent counter.
50. As the operator, I want Refresh to sit next to the `+` button, so that the feed's two top actions are together.
51. As the operator, I accept that a background Automated Run finishing while I sit on the feed won't appear until I refresh, so that we avoid a heavier realtime system for now.
52. As the operator with no Complete Runs yet, I want a clear empty state, so that I'm not staring at a blank page.
53. As the operator, I want the empty state to point me at the `+` button, so that I know how to make my first run.
54. As the operator, I want the empty state to explain that Quote Reposts also generate automatically every two hours from my Discovery Source, so that I understand the app works while I'm away.
55. As the operator, I want a link to each of my Discovery Source X Lists in the empty state, so that I can check or adjust the lists the system watches.
56. As the operator, I want the feed to be the product's landing page after sign-in, so that reviewing finished work is the default thing I do.
57. As the operator, I want joke-title editing to behave the same in the workspace and in the sidebar, so that I don't have to relearn the interaction between surfaces.
58. As the operator, I want the feed to work well on desktop first, so that the surface I actually use is solid before mobile is considered.

## Implementation Decisions

- **Routing.** `/` renders the new Runs Feed and becomes the landing page. The existing generation **Workspace** moves to its own route and is reached from the feed by the `+` "New Manual Run" action. The Workspace component is **not modified**, except for the single additive change in the next point. A thin route wrapper adds the "back to Runs" link around the untouched Workspace rather than editing it.

- **Uniform joke-title editing.** Inline editing of a Visual Joke's Joke Title is implemented once, as a shared component used by **both** the Selected Run sidebar and the Workspace's visual-joke area, so the interaction is identical on both surfaces. This is the only behavioral change inside the Workspace. Editing overwrites the joke's title **within the run's own visual joke set**, mirroring how an edited Draft overwrites its text; the original generated title is not preserved.

- **Complete Run filtering is client-side.** A pure `isCompleteRun(run)` predicate (at least one draft AND at least one visual joke AND at least one generated image variation) gates the feed. The feed pages through the **existing** `GET /api/runs` pagination and drops runs that fail the predicate, fetching further pages as needed to fill the visible target. `GET /api/runs` is **unchanged** — no schema column, no new query, no derived completeness flag.

- **Run Card.** A new card component composes: the fixed Operator Account header (Silicon Mania / @siliconmania with the bundled placeholder avatar asset), the resolved Selected Draft as commentary, the existing **Final Quote Tweet Image composite** for the media (reused, not re-implemented), the embedded Source Tweet as the quoted post (static, not a link), and static decorative engagement chrome. Below the card sit two relative timestamps from `savedAt` and `sourceTweet.createdAt`, formatted with the **existing relative-time formatter** the current runs list already uses.

- **Default resolution.** Each card slot resolves to the operator's explicit choice or, when absent, the first of each — first draft, first Top Pick visual joke, first generated variation — matching **Automated Selection**. The fallback is **display-only**: nothing is written from merely showing or scrolling the feed. A real edit or explicit selection is what persists.

- **Selected Run sidebar.** Opening a card sets the run as the Selected Run and renders, top-to-bottom: Source post (links to `sourceTweet.url`, opens in a new tab) → Text (switch selected draft + inline-edit selected draft text) → Visual jokes (sections Satire / Tech-Positive / Experimental, Top Picks flagged, switch selected joke + inline-edit its title) → Image (switch among the four variations only). The draft/joke/image sections are built from components **shared with the Workspace** so behavior is uniform. The card and sidebar read the same run state so edits reflect on the card immediately.

- **Persistence.** All edits go through the existing run-update + autosave path: the **debounced autosave** (≈350 ms) for free-text edits (draft text, joke title), and an immediate save for discrete selection switches (draft / joke / variation). Saving is the existing **full-run upsert** via the HTTP saved-run store; no new endpoint and no partial-PATCH contract. The existing "mark seen" behavior is preserved when a run is opened.

- **Final Quote Tweet Image derivation.** The composite continues to be derived deterministically (per ADR 0018) from the selected variation and the selected joke; the **edited** Joke Title simply becomes part of that input, so the image re-derives live as the operator switches or rewrites the title.

- **Discovery links in the empty state.** The `/` route reads and parses `DISCOVERY_SOURCE_LIST_IDS` **server-side** (a small parse helper mirroring the existing comma-separated `parseListIds`) and passes the resulting id array to the client feed; the empty state renders one link per id to `https://x.com/i/lists/{id}` and states the every-two-hours cadence. The env var is never exposed to the client bundle.

- **Refresh.** A ghost icon action re-runs the first page of `listPaginated`, merges any newly-arrived Complete Runs to the top of the feed, and emits a quiet toast with the count. No persistent "pending" counter and no local-storage run tracking (rejected: failed runs aren't retained, so the client can't reliably clear such a counter, and Automated Runs are never client-started).

- **API contracts (all unchanged).** `GET /api/runs?limit=14&cursor=…` (offset cursor, `saved_at DESC`), `POST /api/runs` (full-run upsert), `DELETE /api/runs/[runId]`, `POST /api/runs/[runId]/seen`. Page size is `14`, passed by the client.

- **Glossary & decisions of record.** New terms `Runs Feed`, `Run Card`, `Selected Run`, `Complete Run`; `Quote Tweet` renamed to `Quote Repost`; `Visual Joke` / `Selected Visual Joke` made editable-after-generation; `Active Run` / `Single-Page Workspace` reconciled with the feed being the landing page — all in CONTEXT.md, with the architecture captured in ADR 0023.

## Testing Decisions

- **Test external behavior, not internals.** Tests drive the feed the way the operator does — render the component, click cards, switch and type — and assert on what's rendered and on calls into the injected **`SavedRunStore`** seam (`save`, `delete`, `listPaginated`). They must not assert on component state shape, hook internals, or debounce timers beyond their observable effect (a save happens). This mirrors how the current workspace tests are written.

- **Runs Feed component.** Rendered with an injected in-memory store (`createMemorySavedRunStore`) seeded from the existing fixtures — `buildCompletedV3Run` for Complete Runs and `buildCompletedRun` (no image/visual-joke) for an incomplete one. Assert: only Complete Runs render; newest-first order; card content maps to Selected Draft / Final Quote Tweet Image / embedded Source Tweet / two timestamps; default-resolution falls back to first-of-each when no selection exists; scrolling triggers `listPaginated` with the next cursor and appends; the empty state renders one link per parsed Discovery Source id; Refresh re-fetches and toasts the count.

- **Selected Run sidebar.** Assert: clicking a card opens the sidebar with the four sections; switching the selected draft / visual joke / variation calls `store.save` with the updated selection and updates the visible card; inline-editing draft text and joke title calls `store.save` with the overwritten values (joke title overwritten within the run's visual joke set); the Source post link targets `sourceTweet.url` with a new-tab target; delete calls `store.delete` and toasts. Prior art: `workspace-saved-runs.test.tsx`, `workspace-draft-editing.test.tsx`, `workspace-creative-areas.test.tsx`.

- **`isCompleteRun` predicate.** Unit-tested directly across the matrix: missing drafts, missing visual jokes, failed image set, no image set, and the fully-complete case. Prior art: the existing `isRunInFlight` predicate and its tests in the workspace services.

- **Discovery-list parsing.** The `parseDiscoverySourceListIds` helper unit-tested for comma-separated ids, trimming, empty/undefined, and blank entries — mirroring the existing `parseListIds` tests in `discovery-sweep/route.test.ts`.

- **Shared joke-title editor.** A focused test that the uniform component renders the current title, accepts an inline edit, and emits the overwritten value — exercised once so both the sidebar and the Workspace inherit the verified behavior.

- **`GET /api/runs` route.** Left as-is; its existing `route.test.ts` is untouched because completeness filtering is client-side.

## Out of Scope

- **Mobile / responsive.** Desktop only for this PRD.
- **Realtime / streaming feed updates.** New runs surface on feed mount and via Refresh; no subscriptions or polling.
- **A server-side "N generating" count or any pending badge.** Explicitly rejected for now; would require a server-side in-flight count, specced separately if ever wanted.
- **Automatic retry.** A run whose image generation failed simply never reaches the feed; `No Automatic Retry` stands.
- **Changing the manual-generation flow or Workspace internals.** The Workspace is preserved unchanged apart from the additive shared joke-title editor.
- **Server-side Complete Run filtering, a derived completeness column, or keyset cursors.** Client-side filtering over the existing offset pagination is sufficient for a single-operator, low-volume feed.
- **Publishing to X.** The operator still copies or downloads the pieces and posts manually.
- **Editing the Run Label, changing the Selected Image Original, regenerating drafts / jokes / images, or adjusting the User Image Prompt from the feed.** Those remain workspace concerns (and the image original stays locked once variations exist).

## Further Notes

- **Two surfaces, shared parts.** The feed/sidebar and the Workspace both edit runs; they stay consistent by sharing the draft/joke/image section components and the autosave path rather than duplicating logic. Keeping them uniform is a maintenance requirement, not a nicety.
- **Stable defaults.** A run's drafts, visual joke set, and image variations are never regenerated, so "first draft / first Top Pick / first variation" is stable across reloads — the display-only fallback shows the same thing every time until the operator makes an explicit choice.
- **Stable ordering.** `savedAt` is stamped once at generation and not re-stamped on edit (`updated_at` carries the edit time), so editing an old run does not yank it to the top of the feed.
- **Where incomplete runs live.** Successful-but-incomplete runs remain visible in the Workspace's own runs sidebar, which lists all saved runs, so they can still be inspected or deleted.
- **Cadence copy.** The empty state's "every two hours" tracks the Discovery Sweep cron (`0 */2 * * *`); if that schedule changes, the copy should change with it.
- **Brand identity.** The card header is the fixed Operator Account identity — Silicon Mania / @siliconmania — with the bundled placeholder avatar asset; the source author appears only inside the embedded quoted tweet.
- **Page size.** 14 cards per page was chosen deliberately to keep first paint light given how tall full quote-repost cards are; it's a client-supplied limit and easy to tune.
