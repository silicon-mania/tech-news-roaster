# PRD — Remove Visual Joke Generation

> Domain terms follow [CONTEXT.md](../../CONTEXT.md). The decision is recorded in
> [ADR-0026](../adr/0026-remove-visual-joke-generation.md), which supersedes the
> deleted ADR-0017 and ADR-0022 and amends ADR-0011, 0015, 0018, 0021, and 0023.

## Problem Statement

A Generation Run today produces three things: candidate drafts, a Visual Joke Set,
and image variations. The visual-joke half — generating up to twenty-one categorized
jokes across three sections plus Top Picks, choosing a Selected Visual Joke, and
editing its Joke Title — is a large, AI-driven surface the operator no longer wants.
It carries a dedicated provider-agnostic visual joke service, a system-owned
direction prompt, its own model environment variable and a slice of the Runtime
Readiness Gate, and selection-plus-inline-editing UI across both the workspace and
the Selected Run sidebar. For this internal tool that surface is cost without enough
return, and its presence clutters every run, the Runs Feed, Generation Progress, the
documentation, and the configuration.

## Solution

A Generation Run becomes exactly two Creative Result Areas: **Text Generation**
(unchanged — three drafts from the Joke Context Snapshot and User's Direction) and
**Image Generation** (unchanged). Every notion of a visual joke disappears from the
product, the code, the API surface, the environment, and the documentation.

The Final Quote Tweet Image keeps its deterministic, derive-on-demand composition but
no longer carries a Selected Visual Joke's Joke Title. Where the Joke Title used to
go, it renders a fixed placeholder — the literal string `LABEL GOES HERE` — that is
not selected, not editable, and not persisted. As a result the Final Quote Tweet
Image needs only one choice from the operator: the Selected Generated Image. The
overlay appears as soon as the run has a completed Image Set and a Selected Generated
Image.

Joke Context Gathering and the Joke Context Snapshot are preserved unchanged: they
remain the shared understanding layer, now consumed only by Text Generation. The
name "joke context" stays — the product is a roaster and its drafts are still jokes.

## User Stories

1. As an operator, I want a Generation Run to produce only drafts and images, so that the run is simpler and matches how I actually post.
2. As an operator, I want no Visual Joke Creative Result Area anywhere in the center workspace, so that nothing prompts me to pick or read jokes.
3. As an operator, I want no visual joke list, sections (Satire / Tech-Positive / Experimental), or Top Picks rendered, so that the run surface is uncluttered.
4. As an operator, I want no joke skeleton or joke progress shown while a run generates, so that Generation Progress reflects only context gathering, text generation, news-linked image discovery, and image generation.
5. As an operator, I want the Selected Run sidebar to let me switch only the Selected Draft and the Selected Generated Image, so that there is no visual joke to choose there.
6. As an operator, I want no inline Joke Title editing on either editing surface, so that the only inline edit left is a draft's text.
7. As an operator, I want the Final Quote Tweet Image to show `LABEL GOES HERE` where the joke used to be, so that the composite still renders the full Silicon Mania layout.
8. As an operator, I want the Final Quote Tweet Image overlay to appear as soon as I have a Selected Generated Image, so that I am no longer blocked waiting to also pick a visual joke.
9. As an operator, I want the overlay's "what's missing" message to mention only the image selection, so that I am never told to "select a visual joke".
10. As an operator, I want to download the Final Quote Tweet Image with the placeholder label baked in, so that the export still works exactly as before minus the joke.
11. As an operator, I want a Run Card to preview the Quote Repost from two slots — the Selected Draft and the Selected Generated Image — so that the card is ready as soon as both exist.
12. As an operator, I want a run to count as a Complete Run when it has at least one draft and at least one generated image variation, so that runs reach the Runs Feed without a visual joke.
13. As an operator, I want runs whose image generation failed or never ran to stay out of the Runs Feed but remain in the workspace's runs sidebar, so that incomplete runs are still inspectable and deletable.
14. As an operator, I want the Joke Context Snapshot quiet reveal to keep working, so that I can still inspect the gathered context (claim, media read, reply signals, supporting facts, jokeable tensions, forbidden assumptions, context quality) behind the drafts.
15. As an operator, I want Text Generation to keep producing exactly three drafts with diverse angles and direction coverage, so that nothing about drafting changes.
16. As an operator, I want Image Generation, Image Sets, Uploaded Image Sets, and the Selected Generated Image to behave exactly as before, so that image work is untouched.
17. As the system, I want an Automated Run to default to the first draft, the first image original candidate, and the first generated variation only, so that Automated Selection no longer picks a visual joke.
18. As an operator opening an automated run, I want it to already have a Final Quote Tweet Image (image variation + placeholder label), so that I can post or refine immediately without a joke step.
19. As an operator, I want the Runtime Readiness Gate to start work without requiring a visual joke model, so that one fewer boundary must be configured before a run.
20. As an operator, I want Runtime Status to no longer report a visual joke generation boundary, so that the readiness surface reflects only the live boundaries.
21. As a developer, I want all visual-joke-only modules (the visual joke service, the default visual joke direction, the visual joke types) deleted, so that no dead code or contract remains.
22. As a developer, I want the Generation Run contract to carry no visual joke fields, so that persisted and in-flight run payloads are clean.
23. As a developer, I want the result-states contract to have no visual joke generation state, so that Successful Run and Complete Run derive only from text and image outcomes.
24. As a developer, I want the generation stream to emit no visual joke events, so that the SSE contract is free of joke payloads.
25. As a developer, I want the `AI_GATEWAY_VISUAL_JOKE_MODEL` environment variable removed from the example env file and the deployment runbook, so that nobody configures a model the product no longer uses.
26. As a developer, I want the deployment runbook's smoke-test steps and automated-selection description updated to drop the visual joke steps, so that the ops guide matches the product.
27. As a developer, I want the database migration history consolidated into a single fresh init migration that reproduces the current schema, so that the empty database initializes cleanly with no visual-joke-era history.
28. As a developer, I want no API route, service boundary, or barrel export that exists only for visual jokes, so that the public contracts of the generation feature no longer mention them.
29. As a maintainer, I want CONTEXT.md and the ADRs to reflect the removal, so that the durable spec and decision log are the source of truth (already done in this branch).
30. As an operator, I want the humor-standard vocabulary (Boring Accuracy, Truthful Misdirection, Earned Edge, etc.) gone, so that nothing references a humor standard that no longer has a feature.

## Implementation Decisions

These are expressed in terms of the domain boundaries in CONTEXT.md, not file paths.

- **Generation Orchestrator**: remove the visual joke generation branch. It runs Joke
  Context Gathering as the shared prerequisite, then Text Generation and Image
  Generation as the only two Creative Result Areas (with News-Linked Image Discovery
  feeding image originals). It returns a Generation Run with no Visual Joke Set.
- **Generation Run contract**: remove the `selectedVisualJoke`, `visualJokeSet`, and
  `visualJokeDirection` fields and the cross-field validation that a selected visual
  joke must belong to the set. Joke Context Snapshot stays on the run.
- **Result States**: remove the `visualJokeGeneration` state from the result-states
  union. A **Successful Run** = Joke Context Gathering succeeded and at least one of
  Text Generation / Image Generation succeeded. A **Complete Run** = at least one
  draft AND at least one generated image variation.
- **Visual Joke Service / Workflow / Direction**: delete the provider-agnostic visual
  joke service and its candidate providers, the default visual joke direction prompt,
  the humor-standard vocabulary that lived only in that prompt, and the visual joke
  types/schemas.
- **AI Gateway model configuration**: remove the visual joke model reader and the
  `AI_GATEWAY_VISUAL_JOKE_MODEL` environment variable.
- **Runtime Status & Runtime Readiness Gate**: drop visual joke generation from the
  reported service boundaries and from the readiness gate's required set, for both
  the manual run gate and the Discovery Sweep gate.
- **Automated Selection**: remove the first-Top-Pick visual joke default. Defaults
  are the first text draft, the first image original candidate, and the first
  generated variation, each still overridable.
- **Final Quote Tweet Image (composition + overlay)**: the deterministic composite
  takes a single selection input — the Selected Generated Image — plus a fixed label
  string `LABEL GOES HERE`. The Quote Tweet Composite component is unchanged; it
  receives the constant string instead of a joke title. The overlay mounts once the
  run has a completed Image Set (source-derived or uploaded) and a Selected Generated
  Image; it no longer reads any selected-visual-joke state, and its missing-pick
  messaging refers only to the image.
- **Workspace and Selected Run sidebar**: remove the Visual Joke Creative Result Area,
  the visual joke list and its loading skeleton, and Joke Title inline editing. Both
  surfaces edit only draft text and image selection through the shared section
  components and the autosave path.
- **Run Card / Runs Feed**: a Run Card resolves two slots — the Selected Draft and the
  Selected Generated Image (or the first of each) — and renders the Final Quote Tweet
  Image with the placeholder label as media.
- **Generation stream events**: remove visual joke progress and result event payloads
  from the SSE contract.
- **Persistence / schema**: no column change is needed (visual jokes lived in the run
  payload JSON). Consolidate the existing migrations into a single fresh init
  migration that reproduces today's schema (generation runs, generated-image storage,
  author baselines, news-coverage-clusters / seen-tweets, RLS, storage buckets).
- **Preserved unchanged**: Joke Context Gathering, Joke Context Snapshot and its quiet
  reveal, Structured Joke Context (including jokeable tensions and forbidden
  assumptions), Text Generation, Image Generation, Uploaded Image Sets, the Quote
  Tweet Composite.

## Testing Decisions

A good test asserts external behavior at the highest available seam and avoids
coupling to implementation details. No new seams are introduced — every behavior is
covered at an existing seam (confirmed with the developer). Visual-joke-only test
files are deleted; the remaining tests are edited to drop joke assertions and add the
small number of new positive assertions.

- **Generation seam** — the Generation Orchestrator test (and the generation-runs SSE
  stream route test): a completed run carries drafts and image sets and **no** Visual
  Joke Set; no `visualJokeGeneration` result state appears; the stream emits no visual
  joke events. Prior art: the existing orchestrator and stream route tests.
- **Automated Selection seam** — the automated-selection and compose-automated-run
  tests: defaults resolve to first draft + first variation only, with no joke pick.
  Prior art: the existing automated-selection / compose-automated-run tests.
- **Final Quote Tweet Image overlay seam** — the overlay component test: the overlay
  mounts when the run has a completed Image Set and a Selected Generated Image
  **alone**, and the rendered composite contains the literal `LABEL GOES HERE`. This
  is the one genuinely new behavioral assertion. Prior art: the existing overlay and
  final-quote-tweet-image workspace tests.
- **Contract seam** — the generation-run and result-states schema tests: a run payload
  parses with no visual joke fields, and the result-states union has no joke state.
  Prior art: the existing schema tests.
- **Runtime readiness seam** — the runtime-status route test: readiness no longer
  requires or reports a visual joke model boundary. Prior art: the existing
  runtime-status route test.
- **Run Card seam** — the run-card content resolution test: a card resolves from two
  slots (draft + variation). Prior art: the existing resolve-run-card-content and
  run-card tests.
- **Workspace integration** — the workspace tests that referenced jokes (creative
  areas, generation progress, run review, saved runs) drop their joke assertions while
  keeping draft/image coverage.

## Out of Scope

- **An editable headline label.** The label is a fixed placeholder; there is no per-run
  label field, editor, API surface, or persistence. (Rejected option in ADR-0026.)
- **Renaming "Joke Context".** The shared understanding layer keeps its name.
- **Any change to Text Generation or Image Generation behavior**, including Image Sets,
  Uploaded Image Sets, News-Linked Image Discovery, and the Selected Generated Image.
- **Data migration / back-compat.** The database is treated as empty; no migration of
  runs that stored a Visual Joke Set is performed.
- **Deleting the shipped `upload-your-own-image` PRD.** Recommended separately as
  shipped-scaffolding hygiene; not part of this removal.
- **Publishing to X.** Unchanged — the operator still copies or downloads the Quote
  Repost manually.

## Further Notes

- The durable docs are already updated on this branch: CONTEXT.md is scrubbed of all
  visual-joke vocabulary, ADR-0026 records the removal, ADR-0017 and ADR-0022 are
  deleted, and ADR-0011/0015/0018/0021/0023 carry "amended by 0026" banners.
- The example env file and the deployment runbook must be updated in lockstep with the
  code so a deployer is never told to set a model the product no longer reads or to run
  a visual joke smoke-test step.
- The migration consolidation is orthogonal to the feature but bundled here because the
  database is treated as empty; the resulting schema must be byte-for-behavior identical
  to today's four migrations applied in order.
