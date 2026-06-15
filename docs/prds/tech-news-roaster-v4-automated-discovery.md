# Tech News Roaster v4 — Automated Tweet Discovery, Server Persistence & Auto-Finish

> Domain language: [CONTEXT.md](../../CONTEXT.md). Architecture decisions:
> [ADR-0019](../adr/0019-server-side-persistence-and-single-operator-auth.md),
> [ADR-0020](../adr/0020-automated-discovery-via-api-list-polling.md),
> [ADR-0021](../adr/0021-single-image-set-and-automated-selection.md). These supersede
> ADR-0001/0002/0008.

## Problem Statement

As the single operator, I follow ~5000 tech accounts (founders, companies, San Francisco and
worldwide tech). I use Auto-news to produce a recap — candidate drafts plus a Final Quote Tweet
Image — of the news those accounts break or that lands in my For You feed.

Today every step is manual and tied to one browser:

- I have to *notice* the news myself, copy the source tweet URL, and start each run by hand. I
  can't watch X all day and all night, so I miss news or react hours late.
- Even after a run starts, I must personally select the image original, write the image prompt,
  pick the visual joke, and pick the generated variation before a Final Quote Tweet Image exists.
- Every run lives only in my browser via IndexedDB, capped at the ten latest, and is invisible
  from any other device.

The work that matters — judging the editorial angle and the joke — is buried under prospecting and
clicking that a machine could do.

## Solution

Auto-news watches my followed accounts on a schedule, finds the tweets that have gone viral
*relative to their own author*, groups the ones about the same news into a single News Coverage
Cluster so one event makes one run, drops off-topic viral noise with a permissive Newsworthiness
Filter, and runs the whole generation to a finished Final Quote Tweet Image **by itself** — taking
the first draft, the Recommended Visual Joke, the first image original candidate, and the first
generated variation, using a system-owned Default Image Prompt.

When I open the app — from any device, after signing in with my email and a one-time code — I see
**one unified list** of every run, manual and automated, with new ones marked unseen. I open any
run, accept it as is or override the draft, the visual joke, or the variation, then copy or
download the pieces and post the quote tweet to X myself. The tool never posts for me.

I can still start a Manual Run at any time by pasting a source tweet URL (for example something I
caught in my For You feed, which stays outside automation on purpose).

Everything persists server-side under my single Operator Account.

## User Stories

**Discovery and qualification**

1. As the operator, I want a scheduled discovery sweep over my followed accounts, so that news is
   found and turned into runs while I am asleep or away.
2. As the operator, I want my followed accounts watched through the retrieval provider's API rather
   than by automating my real logged-in X session, so that my actual X account is never at risk of
   suspension or shadow-ban.
3. As the operator, I want my followed accounts reached as a small number of operator-owned X Lists,
   so that watching ~5000 accounts costs a handful of calls per sweep instead of thousands.
4. As the operator, I want the For You feed deliberately excluded from automation, so that the
   system never depends on a fragile, algorithmic, unautomatable surface.
5. As the operator, I want virality judged relative to each author's own baseline, so that a small
   founder's breakout and a megaccount's post are both surfaced fairly.
6. As the operator, I want reposts weighted strongly in the virality signal, so that news that is
   genuinely circulating ranks above a tweet that was merely ratio'd.
7. As the operator, I want the system biased toward recall over precision, so that I would rather
   get a run on a tweet that later fizzles than miss a real piece of news.
8. As the operator, I want viral tweets about the same news grouped into one News Coverage Cluster,
   so that a single news event produces a single run instead of ten near-duplicates.
9. As the operator, I want the earliest viral tweet in a cluster chosen as the run's source tweet
   (ties broken toward media presence, then author authority), so that the recap anchors on the
   tweet closest to the news breaking.
10. As the operator, I want a permissive Newsworthiness Filter to drop off-topic viral noise before
    an expensive run starts, so that my morning list is tech news and not memes or personal drama.
11. As the operator, I want a tweet the Newsworthiness Filter rejects to be dropped permanently, so
    that I am not asked to triage a rejection backlog.
12. As the operator, I want each discovery sweep to cover a trailing time window and never process
    the same tweet twice, so that overlapping windows lose nothing at the edges and never duplicate
    a run.
13. As the operator, I want a configurable per-sweep cap on how many runs a single sweep may start,
    ranked by virality, with anything dropped logged rather than silently discarded, so that an
    unusually big news day cannot run away with my budget.

**Automated run and auto-finish**

14. As the operator, I want an automated run to go all the way to a composed Final Quote Tweet Image
    with no input from me, so that I wake up to finished work, not half-finished runs.
15. As the operator, I want Automated Selection to take the first text draft, the Recommended Visual
    Joke, the first image original candidate, and the first generated variation, so that a finished
    result is deterministic and predictable.
16. As the operator, I want an automated run to use the system-owned Default Image Prompt in place of
    the user image prompt, so that image variations can be generated without me writing a prompt.
17. As the operator, I want an automated run to prepare but never publish to X, so that nothing
    unreviewed ever lands on my timeline.
18. As the operator, I want every automated run owned by my Operator Account, so that automated and
    manual work share one history.
19. As the operator, I want a failed or partially-successful automated run to appear in the list with
    its Quiet Failure Details and no automatic retry, exactly like a manual run, so that automation
    introduces no new failure behavior to learn.
20. As the operator, I want a sweep to start nothing when a required service boundary is not ready
    (Runtime Readiness Gate), so that automation never produces broken half-runs.

**Image set shape (manual and automated)**

21. As the operator, I want a run to produce exactly one image set of four variations, so that the
    image surface is simple and predictable.
22. As the operator, I want the four image original candidates sourced first from the source tweet's
    own media and topped up by news-linked image discovery only when the tweet has fewer than four
    usable images, so that the most news-authentic media is preferred.
23. As the operator, I want exactly one image original selected from the four candidates, so that
    there is a single input to image generation.
24. As the operator, I want the selected image original locked once its four variations are
    generated, so that I cannot accidentally trigger a costly regeneration; changing it requires a
    new run.

**Persistence and authentication**

25. As the operator, I want to sign in with my email and a one-time code, so that access is simple
    and passwordless.
26. As the operator, I want only my one allowlisted email able to create the account, so that no
    random visitor can claim the tool.
27. As the operator, I want every run persisted server-side, so that automated runs created while no
    browser is open are saved.
28. As the operator, I want to see all my runs from any device once signed in, so that I am no longer
    tied to one browser.
29. As the operator, I want the ten-run cap removed and the list paginated instead, so that
    continuously accumulating automated runs are all kept.
30. As the operator, I want generated images stored server-side, so that image-heavy runs survive
    outside the browser.

**Unified runs page, review, and override**

31. As the operator, I want one list containing every run, manual and automated, so that I review
    everything in one place.
32. As the operator, I want newly created runs marked as unseen, so that I can tell at a glance what
    arrived while I was away.
33. As the operator, I want to open any run and inspect its drafts, visual joke set, image set, and
    composed Final Quote Tweet Image, so that I can judge the result.
34. As the operator, I want to override the Selected Draft on any run, so that I can choose a
    different commentary than the auto-picked first draft.
35. As the operator, I want to override the Selected Visual Joke, so that I can place a different
    joke title on the image.
36. As the operator, I want to override the Selected Generated Image by re-picking among the four
    existing variations, so that I can change the picture without regenerating.
37. As the operator, I want the Final Quote Tweet Image to recompose instantly on any override with
    no regeneration, so that overriding is free and immediate.
38. As the operator, I want to copy or download each piece of a run, so that I can assemble and post
    the quote tweet on X myself.

**Manual run (retained)**

39. As the operator, I want to start a Manual Run by pasting a source tweet URL, so that I can still
    act on something I caught in my For You feed.
40. As the operator, I want to make every selection myself in a Manual Run — the draft, the visual
    joke, the original among four candidates, and the variation among four — so that I keep full
    editorial control when I choose to.
41. As the operator, I want a Manual Run to use my required User Image Prompt, so that I steer the
    variations when I am driving the run.

## Implementation Decisions

**New Discovery Service boundary.** A provider-agnostic Discovery Service exposes a single
scheduled entry point that composes, in a fixed order: fetch the trailing window of tweets from the
followed-accounts X Lists → drop tweets already in the seen-tweet record → score author-relative
virality → form News Coverage Clusters by semantic similarity over a rolling window → apply the
Newsworthiness Filter to each new cluster's source tweet → start one Automated Run per surviving
cluster, capped per sweep and ranked by virality. The list-timeline read extends the existing
provider-agnostic tweet retrieval (TwitterAPI.io, per ADR-0005) with a list-timeline adapter rather
than a new vendor binding.

**Virality is derived in-house.** The provider returns only raw current metrics plus `createdAt`,
so the system computes velocity (engagement over age, reposts weighted) and normalizes it by a
persisted Author Baseline. Baselines are computed lazily — only for authors whose tweets actually
surface — and refreshed periodically.

**Scheduling mechanism and interval are deferred.** Whether the sweep runs as a cron job, a worker,
or an agent, and the value of the sweep interval Y, are configuration decisions resolved in
implementation issues, not here. Latency is therefore ~Y hours by design.

**New server-side automated run composition.** A non-streaming, server-driven composition runs an
Automated Run to completion without any client: tweet retrieval → joke context gathering →
three-provider text generation (reusing the existing generation orchestrator) → Automated Selection
→ image original candidate building → image generation of four variations → Final Quote Tweet Image
derivation → persistence. Automated Selection is the rule: first draft as Selected Draft,
Recommended Visual Joke as Selected Visual Joke, first candidate as Selected Image Original, first
variation as Selected Generated Image — each overridable later.

**Image set shape change (breaking, manual and automated).** An image set becomes one Selected Image
Original plus exactly four variations, and a run has exactly one image set. The prior "one or two
image sets" and "two variations" shapes are removed, along with multi-original selection. Decision
shape:

```
ImageSet = { selectedImageOriginal, variations: [v1, v2, v3, v4], selectedGeneratedImageId }
```

**Image original candidates.** Exactly four candidates are assembled, drawn first from the source
tweet's own media (the first usable images) and topped up by News-Linked Image Discovery (Serper,
per ADR-0013) only to reach four. The source tweet's media is now a generation input, not only an
understanding input.

**Generation run shape additions.** A run gains an `origin` discriminator, an unseen marker, an
explicit selected-draft reference, the image-prompt source, and an optional link to its News
Coverage Cluster:

```
GenerationRun += {
  origin: "manual" | "automated",
  seenAt: ISO8601 | null,            // null = unseen
  selectedDraftId,
  imagePromptSource: "user" | "default",
  newsCoverageClusterId?: string,
}
```

The existing `status` (`running | completed | failed`) and Successful Run semantics (context plus at
least one successful creative result area) are unchanged. Provider Fallback and No Automatic Retry
apply to automated runs unchanged.

**Persistence moves to Supabase (breaking).** The IndexedDB saved-run store and the ten-run
retention are deleted outright — no dual store, no migration of existing browser runs (internal
tool, no continuity required). Supabase provides: managed Postgres for runs, Author Baselines, the
seen-tweet record, and News Coverage Clusters; object storage for generated image bytes and selected
originals; and email-OTP auth. The browser reaches persistence through server routes so service keys
never reach the client (direct Supabase-client access with row-level security is the considered
alternative; server routes are preferred for key safety in a single-operator tool). The saved-run
contract extends from `list/save/delete` to also load by id, list paginated, and mark a run seen.

**Authentication.** One Operator Account, signup restricted to a single allowlisted email, OTP via
Supabase. A server-side session check gates the app and the runs API; every manual and automated run
is owned by the Operator Account.

**Final Quote Tweet Image unchanged in kind.** It stays derived on demand from its two selections
(ADR-0018); only its inputs and the variation image bytes now live server-side, so overriding a
selection recomposes instantly with no regeneration.

**Runtime Readiness Gate extended.** It now also covers the boundaries automation requires (followed
-accounts retrieval, Supabase, the image and visual-joke models). A sweep that finds the gate not
ready starts nothing that cycle.

**Manual run retained.** Pasting a source tweet URL still starts a Manual Run in which the operator
selects the draft, the visual joke, the original (among four candidates), and the variation (among
four), with a required User Image Prompt.

## Testing Decisions

**Keep and extend the existing automated test suite.** The codebase already has a strong unit and
integration test culture, and it continues: every issue ships with co-located unit and end-to-end
tests so a new implementation cannot silently break the rest. The automated suite stays fast and
deterministic, and normalized fixtures remain its substrate for the vendor boundaries (retrieval,
LLMs, image generation) exactly as [ADR-0005](../adr/0005-provider-agnostic-tweet-retrieval.md)
describes — fixtures are not being removed.

**Real-product validation is operator-driven, with real keys.** Separately from the automated suite,
the operator validates the real product end to end by provisioning production API keys (retrieval
provider, AI Gateway and LLMs, Supabase, Serper) and running it for real, in development as in
production. This extends the existing production smoke checklist in `docs/deployment-v3.md` to cover
a real discovery sweep and a real automated run, and it complements rather than replaces the
fixture-based suite.

**Good tests assert external behavior, not internals.** A test should drive a boundary and check the
observable outcome — for example: a discovery sweep over a known followed-accounts list yields the
expected set of Automated Runs; an Automated Run reaches a composed Final Quote Tweet Image;
overriding a Selected Visual Joke recomposes the Final Quote Tweet Image without regenerating images;
a sweep never starts a second run for a tweet that joins an already-run cluster.

**Pure logic is tested as plain data-in/data-out.** Author-relative virality scoring, cluster
grouping, image-candidate top-up, and the Automated Selection rule are pure functions tested with
ordinary inputs and no service — fast and deterministic. This is not mocking; it is exercising pure
functions directly, and it is where exhaustive edge cases belong.

**Modules covered.** The Discovery Service (sweep ordering, scoring, clustering, newsworthiness, the
per-sweep cap and its drop logging), the server-side automated run composition (including Automated
Selection and the prepare-not-publish boundary), the image set shape (four variations, candidate
sourcing and top-up, locked original), Supabase-backed persistence and run ownership, the email-OTP
allowlist, and the unified runs page (unseen marker, override of draft/joke/variation, instant
recomposition).

**Prior art.** Existing tests already drive the generation route end-to-end, assert the orchestrator
produces three angle-diverse drafts and a visual joke set, and render the workspace for UI behavior.
New tests for discovery, automated runs, the image-set shape, Supabase-backed persistence, and the
unified runs page follow the same external-behavior style and the same fixture strategy.

**Caution to honor.** Real-product validation runs are slow and cost money, so they stay operator-
driven and occasional; the automated regression suite that guards each issue stays fixture-based,
fast, and deterministic.

## Out of Scope

- Publishing to X. An automated run prepares the Final Quote Tweet Image and Selected Draft only;
  the operator copies or downloads and posts manually. Auto-post (and any X write integration) is
  out.
- Automating the For You feed, and any browser-scroll automation of X.
- Migrating existing IndexedDB runs. The old browser store is abandoned, not migrated.
- Multi-user, teams, or roles. Single Operator Account only.
- The "+N accounts covering this news" editorial growth signal on a cluster.
- Email or push notifications. Awareness is the in-app unseen marker only.
- Real-time or near-real-time detection: a candidate→trigger re-sampling model. Discovery is a
  trailing-window batch.
- Exact numeric configuration — virality bar, sweep interval Y, per-sweep cap, Default Image Prompt
  wording, baseline refresh cadence, clustering window and threshold. These are deferred to
  configuration in implementation issues.

## Further Notes

- **Verify before building the discovery primitive.** It is unconfirmed whether the retrieval
  provider passes through native X search operators (`list:`, `min_retweets:`, `min_faves:`). If it
  does, X can pre-filter server-side and the sweep is far cheaper; if not, the sweep pulls list
  timelines and filters in-house. This empirical check gates the cheapest implementation.
  **Resolved (2026-06-15, issue 007):** all three operators pass through; the sweep pre-filters
  server-side and issue 014 builds the adapter on that branch. See the spike section in ADR-0020.
- **Cost driver.** Four image generations per run is the dominant per-run cost; the per-sweep cap is
  the budget backstop, and four variations are generated even in automated runs specifically so the
  operator can later switch variation without regenerating.
- **Codebase direction.** Breaking changes are acceptable and preferred over back-compat shims; dead
  paths (IndexedDB store, ten-run retention, the two-variation/multi-set image shape) are deleted,
  not kept.
