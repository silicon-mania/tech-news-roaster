---
status: accepted
---

# Split AI Gateway Keys by Run Kind

## Context

Every AI Gateway call in the app authenticated with one shared credential
(`AI_GATEWAY_API_KEY`). The
unattended **Discovery Sweep** ([ADR-0020](0020-automated-discovery-via-api-list-polling.md))
runs on a Vercel Cron every two hours and spends real gateway credit on each
**Automated Run** — the **Newsworthiness Filter**, three-provider **Text
Generation**, **News Category** classification ([ADR-0027](0027-ai-selected-news-category-stamp.md)),
and **Image Generation** ([ADR-0010](0010-provider-agnostic-image-generation-service.md)).

To bound that, we want a low Vercel spend limit (e.g. $5/day) on the cron. But a
Vercel spend limit is **per gateway key**, and a **Manual Run** in the Workspace
spends on the *same* key. Capping the one shared key would throttle the very
users the tool serves the moment the cron's budget is exhausted. One key cannot
be both "capped for the cron" and "unrestricted for users."

## Decision

Split the credential by **run kind** — the same manual/automated distinction a
run already records as `origin` — and route each to its own Vercel key.

- **Two keys, both required, no fallback.** `AI_GATEWAY_API_KEY` is the **manual**
  key (Workspace runs; no spend limit). `AI_GATEWAY_AUTOMATED_API_KEY` is the
  **automated** key (the cron; give it the low spend limit). The two are resolved
  independently with **no fallback between them** — automated never reaches for the
  manual key — so once the automated key hits its cap the cron stops rather than
  spilling onto the uncapped manual key. Production must set both. (The former
  Vercel-provided gateway-key alias is removed entirely.)

- **One resolver, threaded run kind.** A single
  `readAiGatewayApiKey(env, runKind)` in `generation/ai-gateway-models.ts`
  replaces the five duplicated key reads. `runKind: "manual" | "automated"`
  **defaults to `"manual"`**, so the manual stream routes and every existing
  caller and test are unchanged — only the automated path declares itself.

- **`composeAutomatedRun` is the one automated entry.** It passes
  `runKind: "automated"` into the Generation Orchestrator
  ([ADR-0006](0006-server-side-generation-orchestration.md)), the classifier, and
  the Image Generation service. The **Newsworthiness Filter** runs *only* inside
  the sweep, so it hard-codes `"automated"` rather than threading a parameter.

- **Deliberately out of scope.** The standalone `/enrich` route
  ([ADR-0012](0012-independent-outside-x-enrichment-endpoint.md)) is modeled as an
  external service with its own credentials; its summarization call keeps the
  manual key rather than threading run kind across that HTTP boundary. Its spend
  is marginal and self-throttles once the capped heavy calls stop for the day.
  The Runtime Readiness status check likewise keeps reading the manual key — its
  presence is what governs "live" mode.

## Considered Options

- **An implicit request-scoped context (AsyncLocalStorage) set at the cron entry.**
  Rejected: the codebase is explicit and dependency-injected throughout; an
  implicit ambient flag would be off-style and harder to test than a defaulted
  parameter. Threading a `runKind` that defaults to `"manual"` costs the manual
  paths nothing and stays greppable.
- **Include `/enrich` by passing run kind in its request body.** Rejected for now:
  it couples a deliberately-external service to an internal flag and needs the
  automated key configured wherever `/enrich` is deployed, for marginal savings.
- **One key with application-level rate limiting instead of two.** Rejected: it
  reimplements, less reliably, the per-key spend limit Vercel already enforces,
  and still can't separate cron budget from user budget on a shared key.

## Consequences

- Production must set both gateway keys; the automated one is capped in Vercel,
  the manual one left uncapped. There is no fallback, so a missing automated key
  fails the cron's gateway calls (in local dev they fall to local providers) — by
  design, since the whole point is to never bill the manual key for cron work.
- Because run kind defaults to `"manual"`, the split is additive: the manual
  Workspace paths, their routes, and their tests needed no changes.
- The Newsworthiness Filter is keyed `"automated"` unconditionally; if it ever
  gains a manual caller, that assumption must be revisited.
- Key selection is centralized and unit-tested as a matrix (manual reads only the
  manual key, automated only the automated key, neither falls back), removing the
  duplicated readers and the old Vercel-provided alias.
