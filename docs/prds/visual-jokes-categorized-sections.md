# Visual Jokes — Categorized Sections & Top Picks

Deliver exactly what the Default Visual Joke Direction asks for: a categorized
**Visual Joke Set** of up to twenty-one jokes across three **Visual Joke
Sections** of seven (Satire / Tech-Positive / Experimental) plus an ordered set
of **Top Picks**, replacing today's flat, ranked-eight, critic-filtered model.

See [CONTEXT.md](../../CONTEXT.md) for vocabulary and
[ADR 0022](../adr/0022-category-based-critic-less-visual-joke-set.md) for the
decision this PRD implements. ADR 0017's provider-agnostic service boundary
still holds.

## Problem Statement

The Default Visual Joke Direction (`default-visual-joke-direction.ts`) instructs
the model to return **exactly 21 satirical headlines in three labeled sections
of seven** — Satire, Tech-Positive, Experimental — and to flag its own top two
or three picks with one-line reasons. That is the editorial product the operator
expects to see when they open the Visual Joke creative result area.

The implementation ignores that instruction. Today the Visual Joke Workflow:

- caps the **Visual Joke Set** at eight jokes in a single flat ranked list, with
  no sections;
- organizes candidates by a hidden eight-pattern taxonomy (truthful
  misdirection, dark tech satire, …) that has nothing to do with the three
  sections the operator was promised;
- runs a local heuristic **Visual Joke Critic** that rejects candidates on word
  count, "boring accuracy," profanity, and more — gates that actively fight the
  direction (the 12-word cap would reject the 13-word Tech-Positive headline the
  direction itself holds up as a model, and the Experimental section is *designed*
  to break those rules);
- wraps the direction in a competing JSON envelope so the "21 in 3 sections"
  instruction never actually reaches the model's output contract.

The result: the operator reads a carefully tuned direction in the quiet reveal,
then receives a set that looks nothing like what it asked for, with no sections,
fewer jokes, and a whole register (Tech-Positive, Experimental) missing.

## Solution

Make the Visual Joke Workflow produce what the direction describes. Send the
Visual Joke Direction (with its `## format` section rewritten to request the JSON
shape) plus the Joke Context Snapshot to the model, and return a **categorized
Visual Joke Set**: three **Visual Joke Sections** targeting seven jokes each,
plus an ordered list of **Top Picks** the model selected itself.

From the operator's perspective:

- The Visual Joke area shows three labeled sections — **Satire**,
  **Tech-positive**, **Experimental** — each with up to seven jokes.
- The model's strongest two-to-three jokes carry a quiet ordered **Top pick**
  label; the first Top Pick is the default and the one an automated run takes.
- The operator can still copy any joke and select exactly one (from any section)
  as the **Selected Visual Joke** for the Final Quote Tweet Image.
- If a section returns fewer than seven, a quiet per-section shortfall notice
  appears, exactly like today's "we'd rather show fewer sharp jokes" tone. The
  area only fails when the whole set is empty or unparseable.

There is **no local critic**: taste lives in the direction and in the model's own
Top Picks. The eight-pattern taxonomy, the per-pattern diversity selection, and
the per-joke Visual Joke Metadata are removed.

## User Stories

1. As an operator, I want the Visual Joke area to show three labeled sections
   (Satire, Tech-positive, Experimental), so that the output matches the
   direction I can read in the quiet reveal.
2. As an operator, I want up to seven jokes per section, so that I have a wide
   spread of options in each register instead of a single capped list.
3. As an operator, I want a Satire section that can hit the company, founders,
   product, valuation, press-release language, or culture, so that I have sharp
   critical angles.
4. As an operator, I want a Tech-positive section whose jokes punch at everyone
   *except* the company and founder (the haters, the wrong analysts, Wall Street,
   the press, the public), so that I can post commentary that defends the subject
   while staying funny.
5. As an operator, I want an Experimental section that deliberately breaks the
   guidelines, so that the brand can discover new registers over time even if
   some candidates miss.
6. As an operator, I want the model's two-to-three Top Picks flagged with a quiet
   ordered label, so that I can see which jokes the model rates highest across all
   sections without reading every one.
7. As an operator, I want to select exactly one Visual Joke from any section as
   the Selected Visual Joke, so that its Joke Title lands on the Final Quote
   Tweet Image.
8. As an operator, I want to change my Selected Visual Joke after the fact
   without regenerating, so that I can revise the Final Quote Tweet Image freely.
9. As an operator, I want to copy any joke's text from any section, so that I can
   reuse it elsewhere.
10. As an operator running an automated run, I want the system to take the first
    Top Pick as the Selected Visual Joke, so that an unattended run reaches a
    Final Quote Tweet Image without me.
11. As an operator, I want the automated pick to remain overridable when I open
    the run, so that the system's choice never locks me in.
12. As an operator, I want a quiet per-section shortfall notice when a section
    returns fewer than seven jokes, so that I understand the set is short without
    a noisy error.
13. As an operator, I want the whole Visual Joke area to fail only when no jokes
    at all come back, so that a thin section never throws away the rest of the
    set.
14. As an operator, I want the Visual Joke area to keep its own independent
    success/failure state, so that a visual joke failure never blocks my drafts
    or images.
15. As an operator, I want Quiet Failure Details available when visual joke
    generation fails, so that I can inspect why without an error wall.
16. As an operator, I want the Visual Joke Direction's quiet reveal to keep
    showing the system-owned direction, so that I can see the house style that
    produced the set.
17. As an operator, I want a saved run to reopen with its sections, top picks,
    and my selection intact, so that I never regenerate to get them back.
18. As an operator, I want the loading skeleton to reserve space for the
    sectioned layout, so that there is no layout shift when the set arrives.
19. As an operator, I want a Top Pick that happens to be an Experimental joke to
    still be selectable and auto-pickable, so that a strong experiment isn't
    excluded — knowing an automated run only prepares and never publishes, so I
    review before posting.
20. As an operator, I want longer Tech-positive headlines (past the old 12-word
    cap) to survive, so that the direction's own example headlines are not
    rejected.
21. As a developer, I want the Visual Joke Set schema to encode sections, order,
    and top picks, so that saved-run contracts and selection stay valid.
22. As a developer, I want the candidate provider interface to return categorized
    output, so that the AI-Gateway adapter and the local dev adapter share one
    contract.
23. As a developer, I want the local dev adapter to emit a realistic 3-section
    set, so that I can develop the UI without live API calls.
24. As a developer, I want an unmatchable Top Pick reference to degrade
    gracefully (drop that pick) rather than fail the set, so that a model
    mismatch doesn't lose all the jokes.

## Implementation Decisions

### Data model (Visual Joke Set)

- A **Visual Joke** carries only `{ id, section, order, text }`. The retired
  per-joke `metadata` (`jokePattern`, `jokeTarget`, `referencedFact`,
  `shortRationale`) is removed.
- `section` is one of `"satire" | "tech-positive" | "experimental"`.
- `order` is the joke's position **within its section**, contiguous from 1.
- The **Visual Joke Set** keeps a single flat `jokes` array (not nested groups)
  so id-based selection and saved-run membership checks stay trivial; the UI
  groups by `section` at render time. It adds an ordered `topPicks` array of
  `{ visualJokeId, reason }` (length 1–3) and a `targetPerSection` (7). The old
  flat `targetCount`, global `rank`, and `recommended` fields are removed.
- Set invariants (validated in the schema): joke ids unique; each section's
  `order` values are contiguous and start at 1; each section holds at most
  `targetPerSection`; every `topPicks[].visualJokeId` references an existing
  joke; top picks are unique and ordered; at least one joke overall.
- The internal `reason` on each Top Pick is never rendered on the main surface
  (no Visible Rationale); it is retained for inspection only.

### Visual Joke Workflow & service

- `generateVisualJokeSet` sends the Visual Joke Direction and Joke Context
  Snapshot to the model and assembles the categorized set. There is **no** local
  critic stage, no per-pattern diversity selection, no candidate scoring.
- The injected **candidate provider** interface (`VisualJokeCandidateProvider`)
  changes its return shape from a flat list of rough candidates to categorized
  output: jokes grouped by section plus the model's top picks (each with a
  one-line reason). The service assigns stable ids and within-section order, then
  resolves each top pick to the id of its matching joke.
- **Top-pick resolution:** match each returned top pick to an emitted joke
  (by exact text within its section). An unmatched top pick is dropped rather
  than failing the set; if all top picks drop, fall back to treating the first
  joke as the sole top pick so Automated Selection always has a target.
- **Graceful shortfall:** the service ships whatever valid jokes return per
  section. It throws `VisualJokeGenerationError` (with a `debugLog` for Quiet
  Failure Details) only when the whole set is empty/unparseable — matching
  today's failure path and the Image Generation failure pattern.
- The AI-Gateway adapter requests structured output via `response_format`
  `json_schema` mirroring the new shape (`{ jokes: [{ section, text }],
  topPicks: [{ section, text, reason }] }`), keeping the existing
  response-format negotiation and one parse repair-retry. Its structured-output
  parse is kept as a small pure step so it is exercisable without the network.

### Direction prompt

- Rewrite the `## format` section of `defaultVisualJokeDirection` so it requests
  the JSON object shape directly (jokes by section + top picks with reasons)
  instead of "plain list, bold headlines." Everything above `## format` (the
  register, the three-section structure, techniques, what-to-avoid) is unchanged.
- The constant still validates via `parseVisualJokeDirectionText`
  (non-empty trimmed string) and still flows into the quiet Direction reveal
  verbatim — the operator now sees the JSON-output instruction as part of the
  documented house style.

### Automated Selection

- `automated-selection.ts` takes `topPicks[0]`'s joke as the Selected Visual
  Joke, falling back to the first joke in the set if (defensively) no top picks
  exist. No section is excluded from this pick.

### UI (Visual Joke area)

- `visual-joke-area.tsx` renders the three sections in direction order under the
  existing "Visual jokes" `SectionHeader`, each section introduced by a light
  subheading (no new borders — spacing/weight per the house style).
- Each Top Pick joke shows a quiet ordered "Top pick" label (icon-led, ghost
  styling), replacing today's single "recommended" treatment.
- Selection and copy controls stay per-joke; selecting one joke clears any other
  selection across all sections.
- The per-section shortfall notice reuses today's quiet muted copy ("Showing X of
  7 …") scoped to each short section.
- `visual-joke-skeleton.tsx` reserves the sectioned layout (three labeled blocks)
  so there is no layout shift.

### Persistence & contracts

- Saved Run continues to store the Visual Joke Set and Selected Visual Joke; the
  new schema is the persisted shape. Reopening a saved run shows sections, top
  picks, and the prior selection without regeneration.
- The stream event payload for the Visual Joke area carries the new set shape;
  the streaming model (one creative result area, set arrives whole) is unchanged.

## Testing Decisions

Good tests assert **external behavior at a seam**, not internals: given an input
(a fake provider's categorized output, a candidate set object, a rendered run),
assert the observable result (the built set, the validation outcome, the rendered
sections, the automated pick). They do not assert private scoring, ordering
heuristics, or call counts. Each seam below already has prior art in the repo.

1. **Schema** (`visual-joke.ts`, prior art `visual-joke.test.ts`): a valid
   3-section set with top picks parses; invariants reject malformed input —
   duplicate ids, non-contiguous within-section order, a section over seven, a
   top pick referencing a missing joke, more than three top picks, an empty set.
   A minimal one-joke set passes.
2. **Service** (`generateVisualJokeSet` with an injected fake provider, prior art
   `visual-joke-service.test.ts`): categorized provider output assembles into the
   three sections with assigned ids/order; top picks resolve to ids; an
   unmatchable top pick is dropped (others survive); all-unmatched falls back to
   the first joke as sole top pick; a short section yields a set that still ships
   with the rest intact; an empty/unparseable response throws
   `VisualJokeGenerationError` carrying a `debugLog`.
3. **Direction prompt** (prior art `default-image-prompt.test.ts`): the rewritten
   `defaultVisualJokeDirection` is a valid non-empty trimmed string and names the
   three sections.
4. **Automated Selection** (prior art `automated-selection.test.ts`): the first
   Top Pick becomes the Selected Visual Joke; with no top picks, the first joke
   is chosen; the pick remains overridable.
5. **UI** (prior art `workspace-creative-areas.test.tsx`,
   `workspace-run-review.test.tsx`): the three labeled sections render with their
   jokes; Top Pick labels appear in order; selecting a joke in one section clears
   a selection in another; a short section shows its shortfall notice; the
   reason text is never rendered.

## Out of Scope

- Any change to text drafts, image generation, image original candidates,
  news-linked image discovery, or the Final Quote Tweet Image layout/composition.
- Operator-editable Visual Joke Direction — it remains system-owned and
  non-editable (only the `## format` wording changes in the constant).
- Re-introducing any local Visual Joke Critic, content moderation, or
  punching-down/misinformation filtering in code (those concerns now live in the
  direction prompt; see ADR 0022 consequences).
- Tweaking the satirical *voice* / register itself beyond the `## format`
  rewrite.
- A migration/backfill for previously saved runs to the new shape (saved runs
  predate this and are not rewritten); only newly generated sets use it.
- Per-section ranking, scoring, or any visible rationale on jokes.
- Localization of section labels.

## Further Notes

- The user originally pointed at `default-image-prompt.ts`; that is the Rick &
  Morty **image** house style and is unrelated. The categories live in
  `default-visual-joke-direction.ts`, which is the prompt this PRD targets.
- The direction asks for "exactly 21," but the product keeps its graceful
  shortfall value (ship survivors, quiet notice) — these reconcile as
  *target 7 per section, ship what returns* (grilling decision 3).
- Removing the critic removes the programmatic floor against punching-down,
  cheap profanity, forbidden assumptions, and boring accuracy. This is a
  deliberate, recorded trade-off (ADR 0022): taste and safety now rely on the
  direction and the model. If real-world output drifts, the lever is the
  direction prompt, not a returned critic.
- Saved-run shape changes are not backward-migrated; verify older saved runs
  still open (or are gated) rather than crash on the new schema.
