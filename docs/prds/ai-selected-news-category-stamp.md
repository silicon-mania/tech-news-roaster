# PRD — AI-Selected News Category Stamp

> Domain terms follow [CONTEXT.md](../../CONTEXT.md). Decisions are anchored by
> [ADR-0027](../adr/0027-ai-selected-news-category-stamp.md) (amending
> [ADR-0026](../adr/0026-remove-visual-joke-generation.md),
> [ADR-0018](../adr/0018-deterministic-derived-final-quote-tweet-image.md), and
> [ADR-0023](../adr/0023-runs-feed-landing-and-selected-run-sidebar.md)).

## Problem Statement

Every **Final Quote Tweet Image** the product builds reads the same dead literal —
`LABEL GOES HERE` — in its headline band. Since visual jokes were removed
([ADR-0026](../adr/0026-remove-visual-joke-generation.md)), that slot has been a
fixed placeholder: not selected, not editable, not persisted. So the most
attention-grabbing element of the **Quote Repost** — the big stamp over the picture —
carries no meaning. The operator has no way to say *what kind of news this is*
(a launch, an acquisition, a firing) from inside the tool, and an unattended
**Automated Run** certainly can't. The headline has to be added by hand, outside the
product, on every single run.

## Solution

The headline band now carries a **News Category**: a short, punchy stamp naming the
kind of tech-news event, drawn from a fixed vocabulary of ten —
`LAUNCHED, DROPPED, ACQUIRED, SIGNED, FIRED, RESIGNED, FUNDED, PUBLISHED, DRAMA, VIRAL`.

A language model auto-selects the best-fitting value while the run generates, reading
the **Joke Context Snapshot** so it classifies by what the **Source Tweet** is actually
framing as the story. This happens on **both** manual and automated runs, so every run
— including ones the operator never watched compose — arrives with a sensible stamp
already on its Final Quote Tweet Image.

The operator stays in control. From either surface that edits a run (the center
workspace and the Runs Feed's **Selected Run** sidebar), a shared **News Category
section** shows the ten values as toggle chips with the AI's pick pre-selected. The
operator can pick a different one, or type a custom word of their own. The Final Quote
Tweet Image updates in real time as they choose, and the choice is autosaved — no save
button. If the classifier ever fails, the stamp simply falls back to `VIRAL`, a quiet
ghost error icon and **Quiet Failure Details** appear on that section, and the run is
otherwise completely unaffected — it stays a **Complete Run** and shows in the
**Runs Feed** like any other.

## User Stories

1. As an operator, I want each Final Quote Tweet Image to show a real News Category stamp instead of `LABEL GOES HERE`, so that the Quote Repost's headline means something.
2. As an operator, I want the stamp drawn from a fixed vocabulary of ten values, so that the headlines stay consistent and on-brand rather than free-form every time.
3. As an operator, I want a language model to auto-select the best-fitting News Category while a run generates, so that I start from a sensible stamp instead of a blank.
4. As an operator, I want the classifier to read the Joke Context Snapshot (the Source Tweet's claim, author context, jokeable tensions, supporting facts), so that it classifies from the richest available understanding rather than a raw URL.
5. As an operator, I want the classifier to follow how the Source Tweet frames the story (the same investment can be ACQUIRED, SIGNED, or FUNDED depending on who the tweet casts as the subject), so that the stamp matches the angle the tweet is actually taking.
6. As an operator, I want a specific event to beat DRAMA when both fit (a CEO ousted amid scandal is FIRED), so that DRAMA stays a meaningful residual and the precise stamps keep firing.
7. As an operator, I want VIRAL to be the residual value when nothing more specific applies, so that genuinely-notable-but-uncategorizable news still gets a stamp.
8. As an operator, I want News Category auto-selected on automated runs too, so that runs the system composed while I was away already carry a stamp when I open them.
9. As an operator, I want to see the AI's selected News Category as the pre-selected chip when I open a run for editing, so that I know what it chose and can accept it with no action.
10. As an operator, I want the ten values shown as toggle chips in the edit section, so that I can see every option at once and switch with one click.
11. As an operator, I want to pick a different value by clicking its chip, so that I can correct the AI when I disagree.
12. As an operator, I want my chip pick saved immediately, so that the run reflects my choice the moment I make it (mirroring how switching the Selected Draft or Selected Generated Image saves).
13. As an operator, I want a custom field beneath the chips, so that I can stamp a word that isn't in the ten when the news needs it.
14. As an operator, I want typing a custom word to deselect the chips, so that it's clear the custom word is now the stamp (the two are mutually exclusive).
15. As an operator, I want my custom word saved with a short debounce as I type, so that editing feels like editing draft text and doesn't thrash the store on every keystroke.
16. As an operator, I want custom words rendered uppercase on the stamp, so that they match the LAUNCHED / DROPPED / … aesthetic even if I type lowercase.
17. As an operator, I want the Final Quote Tweet Image to update in real time as I pick a chip or type, so that I can see the finished headline before I commit to posting.
18. As an operator, I want the live update to show everywhere the composite renders — the workspace overlay, the Run Card in the feed, and the sidebar download view — so that the preview is always truthful.
19. As an operator, I want the News Category section to behave identically in the Selected Run sidebar and the center workspace, so that I don't relearn it between surfaces.
20. As an operator, I want to edit an automated run's News Category from the Selected Run sidebar without entering the workspace, so that refining a stamp is as quick as switching its draft.
21. As an operator editing my own copy of a fanned-out automated run, I want my News Category override to affect only my copy, so that other operators' copies are untouched (each owns its run in isolation).
22. As an operator, I want a classifier failure to fall back to VIRAL, so that the stamp is never blank or broken.
23. As an operator, I want a classifier failure surfaced as a quiet ghost error icon on the News Category section, so that I can tell the AI didn't pick (rather than confidently choosing VIRAL).
24. As an operator, I want a Quiet Failure Details reveal on a failed classification (like image generation has), so that I can inspect the technical detail without it cluttering the surface.
25. As an operator, I want a classifier failure to never make the run fail or drop out of the Runs Feed, so that a missing stamp never costs me a finished, postable run.
26. As an operator, I want the failure trace persisted on the run, so that the ghost icon and Quiet Failure Details are still there when I reopen the run later — including an automated run I never watched generate.
27. As an operator, I want the News Category step shown as a line in Generation Progress on a manual run, so that I can see it run alongside text and image generation.
28. As an operator, I want old or value-less runs to render VIRAL, so that a run that predates this feature still shows a valid stamp.
29. As an operator, I want the classifier to never block a run from starting, so that the Runtime Readiness Gate isn't tightened by a step that can't fail a run.
30. As an operator, I want my News Category choice to survive reopening, editing, and downloading the run, so that the stamp is a durable part of the Saved Run.
31. As an operator, I want the stamp on a downloaded Final Quote Tweet Image PNG to match exactly what I see in the preview, so that what I post is what I approved.
32. As an operator, I want the News Category to be independent of the draft text and image, so that changing my stamp never disturbs my Selected Draft or Selected Generated Image (and vice versa).

## Implementation Decisions

**New domain concept and vocabulary.** A **News Category** is a closed ten-value
classification rendered as the headline stamp on the Final Quote Tweet Image. The
vocabulary and its boundary rules are fixed in code (an enum) and defined in
`CONTEXT.md`: `LAUNCHED` (a new company appears/leaves stealth), `DROPPED` (a
substantial product or body of work ships — app, major release, album, model),
`ACQUIRED` (a company is bought or merged), `SIGNED` (a notable person joins a
different company), `FIRED` (forced out, or staff laid off), `RESIGNED` (voluntarily
steps down), `FUNDED` (a funding round in exchange for shares), `PUBLISHED` (a lighter
editorial/creative piece — essay, article, single song), `DRAMA` (controversy fitting
none of the above), `VIRAL` (residual and failure fallback).

**Classifier service (new module).** A new service classifies a run's News Category.
It is shaped as an injected, provider-style boundary (like Joke Context Gathering and
the Generation Orchestrator): a single, low-temperature AI Gateway call — **not**
three-provider, with **no Provider Fallback** — reusing an already-configured text
model. No new `AI_GATEWAY_*_MODEL` is added, and it is **not** part of the Runtime
Readiness Gate. Its input is the Joke Context Snapshot; its output is one of the ten
values plus, on the unhappy path, a failure with a debug log. It is subject to **No
Automatic Retry**. The prompt encodes the boundary rules and uses the operator's eight
labeled examples (see Further Notes) as few-shot guidance.

**Orchestration integration.** The classifier runs after Joke Context Gathering, in
parallel with Text Generation (and, on automated runs, News-Linked Image Discovery),
since it depends only on the snapshot and does not steer the drafts.
- **Automated runs:** added as one more injected dependency and one more parallel step
  in the automated composition, writing the chosen value onto the assembled run before
  it is validated and persisted. Its failure persists a failed classification state and
  the value defaults to VIRAL; it does **not** affect the Successful Run / Complete Run
  determination.
- **Manual runs:** the classification result is carried in the completed generation
  payload of the run stream, so the saved run (autosaved on completion) carries the
  value and any failure state. The step appears in Generation Progress.

**Schema changes (saved-run contract).** The saved-run schema gains:
- `newsCategory?: string` — the single current value. The classifier writes it; an
  operator edit overwrites it. A value in the ten lights its chip; any other string is
  treated as a custom stamp. Read-time consumers apply `?? "VIRAL"`.
- A classification result-state carrying `status` (`completed` / `failed`),
  timestamps, an optional `message`, and an optional `debugLog` — modeled on the
  existing per-area result-state shape so it reuses Generation Progress rendering and
  the Quiet Failure Details reveal, **without** being counted as a creative result area
  for Successful Run purposes.

  A decision sketch of the added shape (illustrative, not final code):

  ```ts
  // on the saved run
  newsCategory?: string; // current stamp; consumers read `newsCategory ?? "VIRAL"`

  // alongside the other generationResultStates entries (not counted toward success)
  newsCategoryClassification?:
    | { status: "completed"; startedAt: string; completedAt: string }
    | { status: "failed"; startedAt: string; failedAt: string; message: string; debugLog?: string[] };
  ```

The value lives in the JSONB `payload` only — **no new database column and no
migration** (it is never queried or ordered by). The existing required `label` field
(the **Run Label**) is untouched; News Category is a distinct field and concept.

**Composite label threading.** `QuoteTweetComposite` keeps its existing `label` prop;
its three consumers (the workspace overlay, the Run Card, the sidebar download view)
stop passing the `LABEL GOES HERE` constant and instead pass the run's
`newsCategory ?? "VIRAL"`, uppercased. No change to the deterministic composition,
auto-fit, or rasterization. `finalQuoteTweetImageLabel` survives only as the read-time
fallback string, if at all.

**Shared editing component.** A new `NewsCategorySection` is built once and used by
both the Selected Run sidebar and the workspace — the same sharing pattern as
`DraftComparison` and `ImageSetStack`. It renders ten toggle chips (built from the
`Button` primitive in the established click-to-select style) plus a custom text field
(the `Input` primitive). Picking a chip sets `newsCategory` to that value; typing in
the custom field sets `newsCategory` to the typed text and de-highlights all chips;
the two are mutually exclusive. Clearing the custom field with no chip selected snaps
the value back to VIRAL. A failed classification state renders the ghost error icon
and Quiet Failure Details within the section.

**Persistence wiring.** Both surfaces route changes through the existing autosave path:
a chip pick uses the immediate save (`saveRunNow`, as for switching Selected Draft /
Selected Generated Image); a custom-field edit uses the debounced save
(`scheduleRunAutosave`, as for editing draft text). No new API route or store method —
the whole run is POSTed to the existing save endpoint.

**Placement.** The News Category section sits next to the artifact it stamps: above
the Final Quote Tweet Image in the Selected Run sidebar, and as its own compact section
in the workspace column.

## Testing Decisions

Good tests here assert **external behavior at the highest existing seam** — the value
on a parsed run, the stamp text a component renders, the autosave call a change
triggers — never internal wiring. The classifier's *accuracy* (does it pick the
"right" stamp for a given tweet) is explicitly **not** asserted: it is prompt quality,
validated by hand against the eight labeled examples, because freezing model judgment
into unit tests is brittle. Tests inject fakes for every provider — no network.

- **Saved-run schema** (`generation-run.test.ts`, existing): `newsCategory` is optional
  and round-trips; the classification result-state validates in both `completed` and
  `failed` shapes; a run carrying neither still parses.
- **Classifier service** (new test at the new service boundary): with a fake provider
  returning a label, the service yields that value; with a fake provider that throws or
  times out, it yields a failed state and the value resolves to VIRAL; it never retries.
- **Automated composition** (`compose-automated-run.test.ts`, existing): with a fake
  classifier dependency, the composed run carries `newsCategory`; with a failing fake
  classifier, the run persists the failed classification state and VIRAL yet remains a
  successful, feed-eligible run (the success determination is unchanged).
- **Manual stream** (`generation-runs/stream/route.test.ts`, existing): the completed
  payload carries `newsCategory`; a failed classification yields VIRAL plus the failed
  state without failing the run.
- **Composite consumers** (`run-card.test.tsx`, `final-image-download.test.tsx`,
  `final-quote-tweet-image-overlay.test.tsx`, existing): these currently assert
  `"LABEL GOES HERE"`; they are updated to assert the run's `newsCategory` renders as
  the stamp and that a value-less run renders `VIRAL`.
- **Shared `NewsCategorySection`** (new test, modeled on `draft-comparison` tests): the
  active chip reflects the current value; clicking a chip invokes the change with the
  new value; typing a custom word invokes the change and clears the chip selection;
  clearing the custom field resolves to VIRAL; a failed state renders the ghost icon
  and exposes the Quiet Failure Details reveal.
- **Persistence wiring** (`use-selected-run` test + a workspace editing test, existing
  seams): a chip pick calls the immediate save with the updated value; a custom edit
  calls the debounced save.

## Out of Scope

- **Classifier accuracy as an automated test.** Validated by hand against the eight
  labeled examples; no deterministic assertion of model judgment.
- **Remembering the AI's pick separately from the override** (and any "reset to AI
  suggestion" affordance). The run stores the single current value only.
- **Multi-provider fallback or retry for the classifier.** One call; on failure, VIRAL.
- **A dedicated classifier model env var or any Runtime Readiness Gate change.** It
  reuses a configured text model and never gates a run.
- **A separate News Category badge** anywhere outside the Final Quote Tweet Image
  composite (e.g. as its own chip on the Run Card). The stamp lives only on the image.
- **Database column, index, migration, or retroactive backfill.** The value rides the
  JSONB payload; old runs default to VIRAL on read.
- **Changing the Run Label**, the closed vocabulary at runtime (config-driven labels),
  the dark-only theme, or any publish-to-X step.

## Further Notes

- **The eight labeled examples** (the operator's rulings, for the classifier prompt's
  few-shot section): a stealth startup shipping a product *and* announcing a seed round
  → `LAUNCHED`; an existing company launching a standalone app → `DROPPED`; a new album
  → `DROPPED` (heavy work), but a single song or article → `PUBLISHED`; a research
  *paper* → `PUBLISHED`, a new *model* → `DROPPED`; a mass layoff → `FIRED`; an exec
  quitting A while joining B → `SIGNED`; a Microsoft stake → `ACQUIRED` / `SIGNED` /
  `FUNDED` depending on the tweet's framing; a viral tweet that isn't a published work
  → `VIRAL`.
- **The single most important prompt rule:** classify by what the Source Tweet frames
  as the story, not a perspective-free truth. The weight of the work separates DROPPED
  from PUBLISHED.
- **Naming:** the funding-round stamp is `FUNDED`, not `FOUNDED` (which reads as
  company-creation and would collide with `LAUNCHED`).
- **Deferred implementation details** (not decisions, to settle during build): a sane
  `maxLength` on the custom field (the auto-fit shrinks long text, but cap it anyway);
  and the exact reused model for the classifier call.
- This feature reverses the "editable headline label" that
  [ADR-0026](../adr/0026-remove-visual-joke-generation.md) deliberately deferred —
  it foresaw this revisit ("revisit if operators need an in-tool label").
