---
status: accepted
---

# Unified Quote-Repost Composition Core

## Context

The app has one job — turn a **Source Tweet** URL into **Quote Repost** content —
but reached it through two implementations. The automated path (the
`POST /api/bot-ingest` route and the **Discovery Sweep**,
[ADR-0020](0020-automated-discovery-via-api-list-polling.md)) composed a run
server-side in a straight line. The **Manual Run** path re-implemented the
identical pipeline (retrieve tweet → gather joke context → parallel[three-provider
**Text Generation** + **News-Linked Image Discovery** + **News Category**
classification] → assemble **Image Original Candidates** → build creative
result-states) as a *streaming* (SSE) generator the browser consumed, assembled,
and then persisted.

Two copies of one pipeline drifted: streaming vs. batch shape, client-side vs.
server-side persistence, two run-label builders, and a duplicated Successful Run
rule. Every pipeline change had to be made twice and kept in sync by hand.

## Decision

Extract one server-only **composition core**, `composeQuoteRepostCore`, that owns
everything from "we have a tweet URL" through Image Original Candidates: tweet
retrieval → joke context gathering → parallel[three-provider Text Generation
(reusing the **Generation Orchestrator**,
[ADR-0006](0006-server-side-generation-orchestration.md)) + News-Linked Image
Discovery + News Category classification
([ADR-0027](0027-ai-selected-news-category-stamp.md))] → Image Original Candidate
assembly → creative result-states.

- **The core is persistence-, auth-, and image-generation-agnostic.** It returns a
  discriminated result — a *composed* payload or a *typed failure descriptor* (which
  stage failed, the message, any debug log, and the result-states at the point of
  failure) — and performs no persistence, authorization, image generation,
  selection, fan-out, or run-id minting. This seam keeps caller differences out of
  shared code.

- **Caller policy lives in thin wrappers.** The automated composer supplies
  run-kind automated, origin automated, the Default Image Prompt, headless operator
  resolution, inline Image Generation + byte persistence, **Automated Selection**
  ([ADR-0021](0021-single-image-set-and-automated-selection.md)), fan-out
  ([ADR-0024](0024-multi-operator-allowlist-and-automated-run-fan-out.md)), and
  News-Coverage-Cluster id passthrough. The manual composer supplies run-kind
  manual, origin manual, image-prompt source user, the operator's direction, the
  signed-in session operator, and **none** of inline image generation, Automated
  Selection, or fan-out.

- **Billing isolation stays caller-supplied.** The run-kind parameter selects the
  spend-capped automated AI-gateway key vs. the shared manual key
  ([ADR-0028](0028-split-ai-gateway-keys-by-run-kind.md)); it is threaded through
  the core to Text Generation and classification, and the core never defaults it.

- **Manual moves to server-side compose + persist, dropping streaming.** A new
  `POST /api/generation-runs` route composes through the core and persists the run
  under the signed-in operator
  ([ADR-0019](0019-server-side-persistence-and-single-operator-auth.md)), replacing
  the browser-assembles-then-persists flow. The run id is minted client-side and
  passed in (stable optimistic UI; one id avoids collisions on the owner/run
  composite key). The SSE generation route and its client EventSource hook are
  removed; the workspace shows a single "composing…" state instead of live
  per-phase skeletons. The operator still generates images afterward through the
  unchanged operator-triggered Image Generation flow (which keeps its own SSE
  stream).

- **Failure contract is preserved per caller.** Both wrappers persist a failed run
  and return it (HTTP 200 with a failed-status run, so the unified list can show
  it); the Discovery Sweep keeps its benign handling. No path publishes to X.

- **No schema or data-model change.** The saved-run shape is unchanged; `origin`
  stays the manual/automated enum (bot-ingest and Discovery Sweep remain
  automated). No migration. The discovery (tweet-finding) half of the sweep is
  untouched — only the tweet URL and cluster id cross into composition.

## Considered Options

- **Keep two pipelines and sync them by hand.** Rejected — this is the drift the
  decision removes.
- **Share the pipeline but keep manual streaming.** Rejected: streaming forces the
  pipeline into a generator shape distinct from the automated straight-line
  composer, so a single core would still carry two shapes. For a single-operator
  tool the live per-phase signal is not worth a second implementation. Re-adding a
  lighter manual progress signal on top of the batch path is a possible follow-up,
  deliberately out of scope here.

## Consequences

- One composition core: any change to the tweet→candidates pipeline is made once.
  Bot-ingest and the Discovery Sweep inherited it for free once the automated
  composer routed through it — proven by the automated composer's end-to-end test
  passing unchanged.
- Manual runs now show one composing state rather than live per-phase skeletons —
  an accepted UX change scoped to this decision.
- The shared `isSuccessfulRun` rule and a single origin-agnostic run-label builder
  replace the per-wrapper duplicates; the fallback label is now `Run for <id>`
  (the Orchestrator's `Drafts for <id>` label still wins when Text Generation
  succeeds).
- The manual SSE generation route, its client EventSource hook, the stream-URL
  builder, and the generation-service SSE stream-event builders/parsers are all
  removed. The Image Generation SSE events remain, since the operator image flow
  still streams.

This **amends** [ADR-0006](0006-server-side-generation-orchestration.md): its
server-side orchestration stands, but the client-facing progressive/streaming
updates no longer apply to the Manual Run, which now composes and persists
server-side in one request. It builds on
[ADR-0019](0019-server-side-persistence-and-single-operator-auth.md) (server-side
persistence + operator auth),
[ADR-0028](0028-split-ai-gateway-keys-by-run-kind.md) (run-kind billing split, now
threaded through the core),
[ADR-0024](0024-multi-operator-allowlist-and-automated-run-fan-out.md) (automated
fan-out), and [ADR-0027](0027-ai-selected-news-category-stamp.md) (News Category
classification), and deliberately leaves the discovery half of
[ADR-0020](0020-automated-discovery-via-api-list-polling.md) untouched.
