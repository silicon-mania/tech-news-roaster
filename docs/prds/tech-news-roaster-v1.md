## Problem Statement

An internal social media operator wants a fast way to turn a fresh tech-news source tweet into a strong quote-tweet draft without manually reading the whole discourse, synthesizing the news context, or prompting several AI tools by hand. Existing tools tend to produce generic summaries, too much fake customization, or weak humor, which makes them poor at producing a fresh, witty, memorable angle that feels worth posting.

The operator needs a single-page workspace that can take a valid X source tweet URL, optionally accept a user's direction, analyze the source tweet plus replies and supporting outside-X context, and return a small set of strong quote-tweet drafts that are easy to compare, edit, copy, and revisit later on the same device.

## Solution

Build a dark, minimalist, responsive Next.js application that centers on a single-page workspace. A user pastes a valid X source tweet URL, optionally adds freeform user's direction, and starts a generation run. The product retrieves the source tweet and replies through a provider-agnostic tweet retrieval service, enriches context outside X when needed, and uses a server-side generation orchestrator to produce exactly three drafts, one per connected provider by default.

The interface shows a unified runs list, one active run in the center workspace, and a compact source tweet preview alongside the drafts. While generation is in progress, the user sees a running run with lightweight progress updates over SSE. Once complete, the user can compare the three drafts, inspect short visible rationales on demand, edit the drafts as plain text with preserved line breaks, copy any one draft, reopen saved runs, and permanently delete runs. Runs are persisted in IndexedDB on the current device only, with autosave and no manual save action.

## User Stories

1. As an internal social media operator, I want to paste a source tweet URL into one input, so that I can start a generation run quickly.
2. As an internal social media operator, I want the product to reject invalid URLs before generation starts, so that I get immediate feedback instead of wasting time.
3. As an internal social media operator, I want v1 to accept only direct X/Twitter status URLs, so that the source tweet remains the anchor of the run.
4. As an internal social media operator, I want to optionally add a user's direction in freeform text, so that I can steer the output without filling out a complicated form.
5. As an internal social media operator, I want the user's direction field to include lightweight placeholder guidance, so that I understand how to use it without UI clutter.
6. As an internal social media operator, I want the user's direction to be the only explicit steering control, so that the interface stays minimal.
7. As an internal social media operator, I want the product to avoid preset controls for angle, tone, or length, so that I am not distracted by fake customization.
8. As an internal social media operator, I want the system to choose the angle and draft's tone for me, so that the product behaves like a creative assistant rather than a control panel.
9. As an internal social media operator, I want the source tweet to remain the anchor even when outside-X enrichment is used, so that the output still reacts to the right post.
10. As an internal social media operator, I want the product to analyze replies and outside-X context internally, so that I benefit from stronger drafts without seeing a noisy research console.
11. As an internal social media operator, I want the system to use outside-X enrichment when the source tweet is too thin, so that the underlying news is understood correctly.
12. As an internal social media operator, I want the product to create exactly three drafts per generation run, so that comparison is predictable and fast.
13. As an internal social media operator, I want each completed run to normally include one draft per connected provider, so that I get useful provider variety.
14. As an internal social media operator, I want each draft to be a quote-tweet candidate, so that the outputs are directly usable for the target publishing mode.
15. As an internal social media operator, I want each draft to feel publishable rather than like raw model output, so that I can move from generation to posting quickly.
16. As an internal social media operator, I want the drafts in a generation run to explore different angles, so that the comparison is actually useful.
17. As an internal social media operator, I want each draft to commit to one main angle, so that the writing stays sharp.
18. As an internal social media operator, I want at least one draft to meaningfully reflect my user's direction when it is relevant, so that I feel heard.
19. As an internal social media operator, I want the system to be free to challenge my user's direction when it is weak or off-target, so that the best output still wins.
20. As an internal social media operator, I want drafts to stay compact enough to hold attention, so that quote tweets remain readable even without a strict character cap.
21. As an internal social media operator, I want all generated drafts to be in English, so that v1 stays sharp in one language.
22. As an internal social media operator, I want all UI copy to be in English, so that the product feels consistent.
23. As an internal social media operator, I want the source tweet preview visible on the results view, so that I can judge each draft against the original post.
24. As an internal social media operator, I want the source tweet preview to stay compact and docked, so that it provides context without overpowering the drafts.
25. As an internal social media operator, I want a single-page workspace, so that I never feel like I am navigating through a wizard.
26. As an internal social media operator, I want one active run at a time in the center workspace, so that the page stays focused.
27. As an internal social media operator, I want a unified runs list in a side panel, so that I can see current and past runs in one place.
28. As an internal social media operator, I want running runs to appear in the same list as completed runs, so that the interface stays simple.
29. As an internal social media operator, I want a running indicator on in-flight runs, so that I understand what is still happening.
30. As an internal social media operator, I want minimal metadata in the runs list, so that the side panel stays scannable.
31. As an internal social media operator, I want each run to have a short run label, so that I can recognize it quickly in the list.
32. As an internal social media operator, I want a new run to start with a generic label and then upgrade to the first available provider-generated label, so that the list becomes useful quickly.
33. As an internal social media operator, I do not want to rename runs manually, so that the workflow stays lightweight.
34. As an internal social media operator, I want to see a progress count while generation is running, so that I know how many drafts have arrived.
35. As an internal social media operator, I want the UI to update the run label as soon as the first provider response is available, so that the run list becomes more informative in real time.
36. As an internal social media operator, I want the running view to feel live through immediate progress updates, so that waiting feels shorter.
37. As an internal social media operator, I want the page to keep working even when the tab is not focused, so that I can look elsewhere while generation continues.
38. As an internal social media operator, I understand that generation will not survive closing the page, so that the product can stay technically simple.
39. As an internal social media operator, I want the product to display drafts only when all three are available, so that I always compare a complete set.
40. As an internal social media operator, I want provider fallback to recover from provider failures, so that I still get a complete run when possible.
41. As an internal social media operator, I want provider fallback to preserve angle diversity as much as possible, so that duplicate provenance does not lead to duplicate ideas.
42. As an internal social media operator, I want to be told when fallback happened, so that I understand why more than one draft may come from the same provider.
43. As an internal social media operator, I want that fallback explanation to stay lightweight and attached to the results, so that it informs me without interrupting me.
44. As an internal social media operator, I want model provenance visible on every draft, so that I know which company and model produced each one.
45. As an internal social media operator, I want visible rationale available on demand for each draft, so that I can understand the editorial read when I care to inspect it.
46. As an internal social media operator, I want visible rationale to stay short and human-readable, so that it helps without becoming analysis clutter.
47. As an internal social media operator, I want all three drafts to be directly editable inline, so that I can start revising immediately.
48. As an internal social media operator, I want draft editing to be plain text only, so that the editing surface matches social writing.
49. As an internal social media operator, I want pressing Enter to create real line breaks, so that I can shape tweet rhythm naturally.
50. As an internal social media operator, I want copied draft text to preserve line breaks, so that my formatting survives reuse elsewhere.
51. As an internal social media operator, I want edits to persist per draft inside a run, so that I can compare several edited options without losing changes.
52. As an internal social media operator, I want edits to autosave without a save button, so that the interface feels immediate.
53. As an internal social media operator, I want autosave to debounce shortly while I type, so that the app remains responsive without over-saving.
54. As an internal social media operator, I want every successful completed run to save automatically, even before I edit anything, so that I can revisit it later.
55. As an internal social media operator, I want saved runs to reopen exactly as last edited, so that my work is preserved.
56. As an internal social media operator, I do not want saved runs to regenerate, so that reopening a run never changes what I previously saw.
57. As an internal social media operator, I want repeated use of the same source tweet to create independent runs, so that each creative attempt stands alone.
58. As an internal social media operator, I want to reopen saved runs from the side list, so that I can continue editing them later.
59. As an internal social media operator, I want to permanently delete runs from the browser with one simple action, so that I can keep my history clean.
60. As an internal social media operator, I do not want delete confirmations or undo flows in v1, so that cleanup stays frictionless.
61. As an internal social media operator, I want only one in-flight run at a time, so that the app stays simple and predictable.
62. As an internal social media operator, I want the current active run to be replaced when I click another run, so that the workspace remains singular and focused.
63. As an internal social media operator, I want to click a running run from the side panel and inspect its current state, so that I can move around the workspace without waiting for completion.
64. As an internal social media operator, I want the app to feel instant when I click buttons or switch runs, so that the product feels polished despite server orchestration.
65. As an internal social media operator, I want the UI to stay dark and minimalist, so that the tool feels focused rather than decorative.
66. As an internal social media operator, I want the app to work well on phone-sized screens, so that the single-page workspace remains usable on mobile.
67. As a developer, I want a provider-agnostic tweet retrieval service, so that the app is not tightly coupled to one tweet-access vendor.
68. As a developer, I want a server-side generation orchestrator, so that provider keys, prompts, fallback rules, and event streaming stay protected.
69. As a developer, I want progressive generation updates over SSE, so that the client can reflect run progress in real time without polling or WebSockets.
70. As a developer, I want clear runtime contracts for validation, retrieval, generation progress, and saved-run persistence, so that the app remains reliable across client and server boundaries.

## Implementation Decisions

- The product is a single-page workspace built with the latest Next.js App Router, TypeScript, Tailwind CSS, and a dark minimalist UI. shadcn/ui may be used selectively, but the overall experience should remain restrained.
- The product uses one active run at a time in the center workspace and a unified runs list in a side panel. The runs list includes both running runs and completed saved runs, but the UI does not teach that distinction explicitly beyond a visible running state.
- The source tweet is the only valid primary input in v1, and it must be a direct X/Twitter status URL.
- The user's direction remains a single freeform field. There are no explicit tone, length, or angle presets in the UI.
- The publish mode in v1 is quote tweet only.
- Every generation run targets exactly three drafts.
- The completed result is normally one draft per connected provider: OpenAI, Anthropic, and Google through the Vercel AI Gateway path.
- When provider failure prevents a one-per-provider result, provider fallback may substitute another successful provider draft to preserve a complete run, with angle diversity preferred over cosmetic provenance symmetry.
- The client sees model provenance on each draft and a lightweight notice when provider fallback caused duplicated provenance.
- The source tweet remains the anchor of the product even when outside-X enrichment is used.
- Replies and outside-X enrichment are internal inputs to editorial interpretation and are not shown as first-class user-facing research panels in v1.
- Visible rationale is optional, hidden by default, expandable per draft, and must stay short and human-readable.
- Drafts are plain-text editable surfaces with preserved line breaks and per-draft local edited state.
- Copy operates per draft, not per run.
- Completed runs persist in browser-only storage on the current device. There is no account system, no server persistence, and no cross-device continuity in v1.
- IndexedDB is the default persistence layer for saved runs because runs are structured client-owned records that can accumulate over time.
- Saved run records include the source tweet, user's direction, model provenance, date, latest edited draft content, and related metadata needed to reopen the run.
- Running runs appear in the runs list before completion so the user can see and reopen the in-flight object in the single-page workspace.
- Completed runs are saved automatically when all three drafts are available.
- Draft edits autosave with a short debounce and no manual save action.
- Saved runs never regenerate. Reopening a saved run restores the last edited state only.
- Reusing the same source tweet later creates a new independent generation run.
- Deleting a run is immediate and permanent in v1, with no confirmation and no undo.
- Only one in-flight run is allowed at a time.
- The tweet retrieval service is server-side and provider-agnostic. The product should not be tightly shaped around the official X API.
- The generation orchestrator is server-side behind Next.js route handlers. It is responsible for calling providers, applying prompt strategy, tracking provider progress, applying provider fallback, and producing complete generation runs.
- Progressive run updates should be streamed to the client via SSE so the UI can show progress counts, update the run label when the first provider response arrives, and flip the running run to a completed saved run once the set is ready.
- The app should keep generation, retrieval, and validation concerns distinct at the route/service level even if all of them live inside Next.js route handlers.
- The client data model should treat saved runs as client-owned IndexedDB-backed state, while TanStack Query coordinates server interactions and transient async state.
- Zod should define important runtime contracts end-to-end, including URL validation, retrieved source tweet shape, generation progress events, completed run payloads, and IndexedDB record shape.
- The generation language and all UI copy in v1 are English only.

## Testing Decisions

- A good test should verify observable behavior at the highest meaningful seam and avoid asserting implementation details such as internal hooks, local state shape, or provider-specific helper internals unless there is no higher seam available.
- The highest-priority seam is the single-page workspace flow. Tests at this seam should cover valid and invalid source tweet URL handling, running run creation, SSE-driven progress updates, run label updates, complete three-draft display, inline editing, copy behavior with preserved line breaks, reopen behavior, and permanent delete behavior.
- Route contract tests should cover the validation, retrieval, and generation server boundaries separately. These tests should assert request/response/event contracts, status handling, and fallback-related payload behavior rather than the internal implementation of provider clients.
- IndexedDB persistence tests should cover saved run creation, running-to-saved transitions, autosave behavior, reopening last edited drafts, single-device history behavior, and permanent deletion.
- Generation orchestrator tests should cover provider progress tracking, one-per-provider happy path, provider fallback behavior, complete-run-only display/save behavior, and contract shapes emitted to the client over SSE.
- Copy-related tests should verify that plain-text editing preserves line breaks through autosave, reopen, and clipboard interactions.
- Because the repo is greenfield, there is no strong local prior art yet. The initial test suite should establish the product’s preferred seams clearly so later implementation stays aligned with the intended behaviors.

## Out of Scope

- Standalone tweet generation in v1.
- Reply-draft generation modes other than quote tweet.
- Multi-language draft generation or multi-language UI.
- User-selectable tone, length, or angle presets.
- Rich-text editing controls.
- Server-side persistence, user accounts, team sync, or cross-device continuity.
- Re-running saved runs.
- Multiple concurrent in-flight runs.
- A visible replies browser or visible outside-X research panel.
- Complex deletion safeguards such as trash, undo, or confirmation dialogs.
- A separate backend service outside Next.js for v1.
- Durable background generation that survives tab closure.

## Further Notes

- The product’s differentiation is creative reframing, not neutral summarization.
- The source tweet preview should feel minimalist and cool, but it must remain secondary to the draft editing surface.
- The product should optimize for immediacy at every interaction point: fast validation, immediate run creation in the list, progressive streaming feedback, autosave, and quick run switching.
- The “magic sauce” of the product includes reply analysis and outside-X enrichment, but that value should mostly surface through better drafts and short visible rationales rather than research-heavy UI.
- The current glossary in `CONTEXT.md` and ADRs in `docs/adr/` are part of the source of truth for future issue breakdown and implementation planning.
