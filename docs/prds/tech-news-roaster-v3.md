## Problem Statement

Tech News Roaster v2 can turn a fresh tech-news Source Tweet into three Quote Tweet drafts and optional image options, but it does not yet solve the hardest creative problem for the final visual: generating the short, sharp Visual Joke that will become the first readable hook on the Quote Tweet image.

The user needs the app to understand brand-new X news even when the tweet is too fresh for articles to exist elsewhere. That requires more than outside-X search. The app must interpret the Source Tweet text, media, replies, author context, and supporting research, then use that understanding to produce polished Joke Titles in the right Visual Joke Taste: dark, sharp tech satire that reads as a ruthless observer of tech incentives without becoming condescending, patronizing, or mean-spirited.

The workflow must stay effort-less. The user should not debug missing context, prompt-engineer jokes, approve intermediate research, or manually gather information for retries. The product should expose quiet transparency through clean modals for the Joke Context Snapshot and Visual Joke Direction, while the main workspace remains compact, clear, and focused on generated outputs.

## Solution

Introduce v3 as a new Visual Joke Generation step inside each Generation Run.

The user still starts by pasting a Source Tweet URL and may still provide User's Direction for Text Generation only. The app retrieves the Source Tweet, replies, author data, metrics, and media references through the Tweet Retrieval Service. After retrieval, Joke Context Gathering becomes the shared prerequisite understanding layer for Text Generation and Visual Joke Generation. It produces a Structured Joke Context, persisted as the Joke Context Snapshot, that includes the source tweet claim, Source Tweet Media Extraction, Author Context, Reply Signals with representative snippets, supporting facts, unknowns, Jokeable Tensions, Forbidden Assumptions, and Joke Context Quality.

News-Linked Image Discovery becomes a separate automatic initial-run step for gathering one to five News-Linked Images for later Image Generation. Image Generation itself remains unchanged for v3: it uses only selected image originals and the User Image Prompt, and does not use the Joke Context Snapshot.

Once Joke Context Gathering completes, Text Generation and Visual Joke Generation run as sibling creative result areas. Text Generation creates exactly three editable Drafts from the Joke Context Snapshot and User's Direction. Visual Joke Generation uses the Joke Context Snapshot and global system-owned Visual Joke Direction to run a Visual Joke Workflow: extract Jokeable Tensions, generate pattern-diverse candidates, critique them against Visual Joke Taste, reject Boring Accuracy, and return a ranked Visual Joke Set.

The Visual Joke Set contains five to eight polished, publishable Visual Jokes, with eight as the default target. The first joke is the Recommended Visual Joke and receives a quiet recommended label, but it is not automatically selected. All jokes are visible, non-editable, copyable, and selectable. Selecting a Visual Joke is optional and persisted for later image/title work, but it does not gate Image Generation in v3.

The Single-Page Workspace should show compact Generation Progress and separate Creative Result Areas for Text Generation, image work, and Visual Joke Generation. The UI should communicate where the run is, why the user is waiting, and which steps are not started yet without adding long explanatory text. Failed context or creative result areas show concise failure states with Quiet Failure Details behind a quiet reveal. There is no automatic retry, no Visual Joke provider fallback, no joke regeneration action, and no visible rationale for jokes.

Saved Runs persist the Joke Context Snapshot, Visual Joke Direction, Visual Joke Set, Selected Visual Joke, drafts, image state, and existing v2 data. Reopening a Saved Run never regenerates drafts, visual jokes, context, or images. Reusing the same Source Tweet URL creates a new independent Generation Run.

## User Stories

1. As an internal social media operator, I want to paste a Source Tweet URL as before, so that v3 keeps the same starting workflow.
2. As an internal social media operator, I want each click on the run action to create a new Generation Run, so that repeated use of the same Source Tweet URL creates independent creative attempts.
3. As an internal social media operator, I want the Source Tweet to remain the anchor of the run, so that creative outputs respond to the selected post rather than generic tech news.
4. As an internal social media operator, I want the app to retrieve the Source Tweet, author, metrics, replies, and media references, so that the run starts from the full X context.
5. As an internal social media operator, I want the Tweet Retrieval Service to remain focused on retrieval, so that tweet fetching does not become a broad analysis service.
6. As an internal social media operator, I want Source Tweet Media Extraction to be first-class, so that screenshots, product UI, charts, images, and videos can carry the news when tweet text is short.
7. As an internal social media operator, I want media understanding to happen after tweet retrieval, so that the app can improve media interpretation separately from tweet fetching.
8. As an internal social media operator, I want Joke Context Gathering to understand source tweet media, so that the jokes do not miss the main thing worth joking about.
9. As an internal social media operator, I want Joke Context Gathering to include Author Context, so that an official founder announcement is interpreted differently from a random user's observation.
10. As an internal social media operator, I want Author Context to stay narrow, so that the app understands why the poster matters without creating a full biography.
11. As an internal social media operator, I want replies converted into Reply Signals, so that audience confusion, backlash, jokes, corrections, and repeated interpretations become usable context.
12. As an internal social media operator, I want Reply Signals to include representative snippets, so that the app preserves useful flavor without carrying every raw reply.
13. As an internal social media operator, I want Joke Context Gathering to include supporting research, so that the app can understand names, brands, products, and technical references cited in fresh tweets.
14. As an internal social media operator, I want supporting research to be used only when needed, so that the Source Tweet remains the anchor.
15. As an internal social media operator, I want Joke Context Gathering to work even when no external article exists yet, so that brand-new X news can still produce strong jokes.
16. As an internal social media operator, I want Joke Context Gathering to produce a fixed Structured Joke Context, so that creative generation receives reliable inputs.
17. As an internal social media operator, I want the Structured Joke Context to include the source tweet claim, so that the app knows what the tweet appears to be announcing or implying.
18. As an internal social media operator, I want the Structured Joke Context to include a media read, so that visible text, UI details, screenshots, charts, and video frames can influence jokes.
19. As an internal social media operator, I want the Structured Joke Context to include Author Context, so that poster identity and authority are explicit.
20. As an internal social media operator, I want the Structured Joke Context to include Reply Signals, so that the app can see what the audience already finds strange or funny.
21. As an internal social media operator, I want the Structured Joke Context to include supporting facts, so that jokes can be specific and defensible.
22. As an internal social media operator, I want the Structured Joke Context to include unknowns, so that weak or missing context is acknowledged internally.
23. As an internal social media operator, I want the Structured Joke Context to include Jokeable Tensions, so that the joke generator works from contradictions, pressures, absurdities, and uncomfortable trade-offs.
24. As an internal social media operator, I want the Structured Joke Context to include Forbidden Assumptions, so that truthful misdirection does not become misinformation.
25. As an internal social media operator, I want the Structured Joke Context to include Joke Context Quality, so that the app knows when context is strong or thin.
26. As an internal social media operator, I want Joke Context Quality to remain internal, so that the product does not become a research/debug panel.
27. As an internal social media operator, I want the Joke Context Snapshot to be inspectable through a quiet button, so that I can see the real structured context when needed.
28. As an internal social media operator, I want the Joke Context Snapshot modal to show the full structured context cleanly formatted, so that transparency does not become a raw log dump.
29. As an internal social media operator, I want the Joke Context Snapshot to be transparency-only, so that I do not need to approve or fix context before jokes are generated.
30. As an internal social media operator, I want Joke Context Gathering to fail the run when it cannot form usable context, so that creative branches do not guess.
31. As an internal social media operator, I want a failed context state to be concise in the main UI, so that the workspace stays simple.
32. As an internal social media operator, I want complete context failure details hidden behind a quiet reveal, so that debugging remains possible without cluttering normal use.
33. As an internal social media operator, I want Text Generation and Visual Joke Generation to start after Joke Context Gathering completes, so that both use the same understanding layer.
34. As an internal social media operator, I want Text Generation and Visual Joke Generation to run as sibling result areas, so that neither waits on the other creatively.
35. As an internal social media operator, I want Text Generation to use the Joke Context Snapshot and User's Direction, so that drafts benefit from richer context while keeping user steering for text.
36. As an internal social media operator, I want User's Direction to affect only Text Generation, so that Visual Joke Generation keeps a stable system-owned taste.
37. As an internal social media operator, I want Visual Joke Generation to use the Joke Context Snapshot and Visual Joke Direction, so that jokes are generated from context plus a consistent humor standard.
38. As an internal social media operator, I want Visual Joke Direction to be global and system-owned, so that the app owns the joke taste rather than making me prompt-engineer.
39. As an internal social media operator, I want Visual Joke Direction to be inspectable through a quiet button, so that I can see the exact internal prompt when I need transparency.
40. As an internal social media operator, I want the Visual Joke Direction modal to show the full internal prompt exactly as sent, so that it does not hide the real steering text.
41. As an internal social media operator, I want Visual Joke Taste to favor dark, sharp tech satire, so that jokes feel like ruthless observations of tech incentives.
42. As an internal social media operator, I want Visual Joke Taste to avoid condescending, patronizing, or mean-spirited jokes, so that the humor teases systems rather than punching down.
43. As an internal social media operator, I want Visual Jokes to target systems, incentives, product dynamics, company behavior, platform power, market logic, or hype cycles, so that the joke's bite lands in the right place.
44. As an internal social media operator, I want Visual Jokes to avoid mocking harmless users or people with no power, so that sharp jokes do not become mean-spirited.
45. As an internal social media operator, I want Visual Jokes to name public figures, companies, brands, products, or organizations when they are central Named News Actors, so that jokes feel specific and real.
46. As an internal social media operator, I want Visual Jokes to use Tech-Native Punchlines when useful, so that the humor speaks to the tech ecosystem.
47. As an internal social media operator, I want Visual Jokes to avoid forcing tech terms when a sharper non-technical punchline works better, so that the joke does not feel gimmicky.
48. As an internal social media operator, I want Visual Jokes to use Context-Supported References, so that jokes are legible at scroll speed.
49. As an internal social media operator, I want Visual Jokes to avoid obscure deep-lore references unless the context snapshot supports them, so that jokes do not fail because readers lack hidden background.
50. As an internal social media operator, I want Visual Jokes to use Truthful Misdirection, so that a real technical or contextual fact can be framed in a surprising way.
51. As an internal social media operator, I want Truthful Misdirection to remain defensible, so that surprising jokes do not become clickbait lies.
52. As an internal social media operator, I want Visual Jokes to use Earned Edge selectively, so that profanity, sexual bluntness, dark humor, or harsh phrasing appears only when it clarifies the absurdity or strengthens the punchline.
53. As an internal social media operator, I want Visual Jokes to avoid random profanity or decorative shock value, so that edgy jokes remain intentional.
54. As an internal social media operator, I want sexually blunt jokes to be allowed only when public news involving Named News Actors supports them, so that the joke targets public behavior rather than private humiliation.
55. As an internal social media operator, I want Visual Jokes to work as Joke Titles, so that they feel like short title-like one-liners for the Quote Tweet image.
56. As an internal social media operator, I want Joke Titles to usually be three to twelve words, so that they are instantly readable while scrolling X.
57. As an internal social media operator, I want Joke Titles to give a fast read on the news, so that the reader understands what the joke is about.
58. As an internal social media operator, I want Joke Titles to land like insider punchlines, so that they feel made for the intended tech audience.
59. As an internal social media operator, I want Visual Joke Generation to return a Visual Joke Set of five to eight candidates, so that I have enough options to find a standout.
60. As an internal social media operator, I want the default Visual Joke Set target to be eight, so that the app explores enough joke directions without overwhelming me.
61. As an internal social media operator, I want all returned Visual Jokes to be polished and publishable, so that I do not need to sort through near-miss brainstorms.
62. As an internal social media operator, I want the Visual Joke Set to be ranked, so that the strongest candidate appears first.
63. As an internal social media operator, I want the first joke to be labeled recommended, so that I can see the app's best bet quickly.
64. As an internal social media operator, I want the recommended joke not to be automatically selected, so that Selected Visual Joke reflects my explicit choice.
65. As an internal social media operator, I want all eight jokes visible at once, so that I can scan options quickly.
66. As an internal social media operator, I want each Visual Joke to be copyable, so that I can use the joke text directly even before image/title compositing exists.
67. As an internal social media operator, I want each Visual Joke to be selectable, so that I can preserve my favorite for future image/title work.
68. As an internal social media operator, I want selecting a Visual Joke to be optional, so that it does not block Image Generation in v3.
69. As an internal social media operator, I want Selected Visual Joke to be persisted, so that reopening the run remembers my choice.
70. As an internal social media operator, I want Visual Jokes to be non-editable, so that the app stays focused on automatic joke generation rather than becoming another text editor.
71. As an internal social media operator, I want no visible rationale for Visual Jokes, so that the UI does not explain the joke and kill it.
72. As an internal social media operator, I want Visual Joke Metadata to remain internal, so that the app can compare, debug, save, and maybe rank jokes later without cluttering the UI.
73. As an internal social media operator, I want each Visual Joke to carry internal metadata such as joke pattern, joke target, referenced fact, and short rationale, so that the app can evaluate the joke without showing that detail.
74. As an internal social media operator, I want the Visual Joke Set to include Joke Pattern Diversity, so that I get different kinds of jokes instead of eight paraphrases.
75. As an internal social media operator, I want the set to explore truthful misdirection, dark tech satire, tech-native metaphor, fake product naming, deadpan diagnosis, incentive roast, absurd headline, and earned edge when context supports them, so that the app has a real chance of finding a winner.
76. As an internal social media operator, I want at least one Bold Joke Candidate when the context supports it, so that the best possible joke is not lost to safe defaults.
77. As an internal social media operator, I want the Visual Joke Critic to reject Boring Accuracy, so that accurate but flat titles do not appear as jokes.
78. As an internal social media operator, I want the Visual Joke Critic to reject unsupported claims, so that jokes remain factually defensible.
79. As an internal social media operator, I want the Visual Joke Critic to reject condescending jokes, so that the humor does not become patronizing.
80. As an internal social media operator, I want the Visual Joke Critic to reject overlong joke titles, so that jokes remain readable on an image.
81. As an internal social media operator, I want the Visual Joke Critic to reject cheap profanity, so that edge only appears when earned.
82. As an internal social media operator, I want Visual Joke Generation to be a workflow rather than a single prompt, so that candidate generation and critique can improve joke quality.
83. As an internal social media operator, I want the Visual Joke Workflow to extract Jokeable Tensions before writing final jokes, so that jokes come from actual comedy fuel.
84. As an internal social media operator, I want the Visual Joke Workflow to generate more rough candidates internally than it returns, so that the final set is curated.
85. As an internal social media operator, I want the Visual Joke Workflow to rank or filter candidates before returning them, so that the UI shows polished candidates only.
86. As an internal social media operator, I want Visual Joke Generation to fail independently if it fails, so that Text Generation and Image Generation can still succeed.
87. As an internal social media operator, I want a failed jokes area to show concise failure copy, so that the run remains understandable.
88. As an internal social media operator, I want Quiet Failure Details for failed joke generation, so that technical detail is available without overwhelming the workspace.
89. As an internal social media operator, I want no automatic retry for Visual Joke Generation, so that waiting remains honest.
90. As an internal social media operator, I want no provider fallback for Visual Joke Generation in v3, so that the new workflow stays simple.
91. As an internal social media operator, I want no regenerate-jokes action, so that the Saved Run model stays simple and version-free.
92. As an internal social media operator, I want a new creative attempt to mean a new Generation Run, so that different attempts stay separate.
93. As an internal social media operator, I want Visual Joke Generation to be provider-agnostic, so that the product is not tied to one AI provider or model.
94. As an internal social media operator, I want the Visual Joke Service to be allowed to evolve internally, so that future model or workflow changes do not change the product concept.
95. As an internal social media operator, I want News-Linked Image Discovery to remain automatic during the initial run, so that v3 does not regress the v2 image workflow.
96. As an internal social media operator, I want News-Linked Image Discovery to stay separate from Joke Context Gathering, so that understanding fresh news is not confused with finding image candidates.
97. As an internal social media operator, I want News-Linked Image Discovery to remain provider-agnostic, so that the current search provider can be replaced later if needed.
98. As an internal social media operator, I want Image Generation to stay unchanged in v3, so that the main focus remains better Visual Jokes.
99. As an internal social media operator, I want Image Generation to keep using only selected image originals and the User Image Prompt, so that hidden joke context does not unexpectedly change image results.
100. As an internal social media operator, I want Image Generation to remain user-triggered, so that generated image variations are still intentional.
101. As an internal social media operator, I want Selected Visual Joke not to gate Image Generation, so that joke selection does not slow the existing image workflow.
102. As an internal social media operator, I want Image Generation not to regenerate or mutate the Visual Joke Set, so that result areas remain independent.
103. As an internal social media operator, I want Generation Progress to show context gathering, draft creation, image discovery, joke title generation, and image generation status, so that I know why I am waiting.
104. As an internal social media operator, I want future or unavailable steps to appear disabled or not started, so that the workflow is understandable without long explanations.
105. As an internal social media operator, I want Text Generation, image work, and Visual Joke Generation separated into clean Creative Result Areas, so that outputs do not blur together.
106. As an internal social media operator, I want the UI to use minimal copy, so that the app stays fast and obvious.
107. As an internal social media operator, I want the UI to remain responsive, so that context, drafts, image options, and joke titles stay usable on small screens.
108. As an internal social media operator, I want the Joke Context Snapshot and Visual Joke Direction reveals to be quiet, so that transparency does not dominate the main workflow.
109. As an internal social media operator, I want Saved Runs to persist the Joke Context Snapshot, so that I can inspect the exact context later.
110. As an internal social media operator, I want Saved Runs to persist the Visual Joke Direction text used, so that the quiet prompt modal remains truthful after reopening.
111. As an internal social media operator, I want Saved Runs to persist the Visual Joke Set exactly as generated, so that reopening never changes jokes.
112. As an internal social media operator, I want Saved Runs to persist the Selected Visual Joke, so that my chosen option survives reopening.
113. As an internal social media operator, I want Saved Runs to persist independent success and failure states for text, jokes, image discovery, and image generation, so that partial success remains useful.
114. As an internal social media operator, I want Saved Runs to never regenerate context, drafts, jokes, or images on reopen, so that saved work remains stable.
115. As an internal social media operator, I want Saved Run Retention to keep the ten latest successful runs as before, so that browser storage remains bounded.
116. As an internal social media operator, I want the existing deletion process to remain unchanged, so that v3 does not add storage-management complexity.
117. As an internal social media operator, I want running and failed runs to remain outside the retention count, so that useful completed work determines the saved-run limit.
118. As a developer, I want runtime contracts for Joke Context Snapshot, Structured Joke Context, Visual Joke, Visual Joke Metadata, Visual Joke Set, and Selected Visual Joke, so that v3 state is reliable across client and server boundaries.
119. As a developer, I want the initial run stream to expose context, text, image discovery, and joke progress events, so that the client can render Generation Progress without polling.
120. As a developer, I want the Visual Joke Service to return ranked, validated joke candidates, so that the UI does not need to infer joke quality.
121. As a developer, I want the Media Understanding Service to be separate from Tweet Retrieval Service, so that OCR, image reading, UI interpretation, chart reading, and video frame analysis can evolve independently.
122. As a developer, I want the v3 implementation to respect the new ADRs for context gathering, media understanding, and provider-agnostic joke service boundaries, so that the implementation matches the product language.

## Implementation Decisions

- v3 introduces Visual Joke Generation as a new creative result area inside the Generation Run.
- Visual Joke Generation is separate from Text Generation and Image Generation.
- Visual Joke Generation starts after Joke Context Gathering completes.
- Visual Joke Generation does not depend on Text Generation, Image Generation, image selection, or Selected Visual Joke.
- Visual Joke Generation produces a Visual Joke Set, not text drafts and not image overlays.
- A Visual Joke is a non-editable, copyable, selectable Joke Title intended to become the first readable element on a future Quote Tweet image.
- A Visual Joke Set contains five to eight polished, publishable candidates.
- Eight Visual Jokes is the default target.
- The Visual Joke Set is ranked, with the strongest candidate first.
- The first Visual Joke is shown as the Recommended Visual Joke.
- The Recommended Visual Joke is not automatically selected.
- Selected Visual Joke is optional in v3.
- Selected Visual Joke does not gate Image Generation.
- Visual Jokes are copyable one by one.
- Visual Jokes are not editable.
- Visual Jokes do not show visible rationale.
- Visual Joke Metadata remains internal and may include joke pattern, joke target, referenced fact, and short rationale.
- The Visual Joke Workflow is not a single prompt. It can include context use, Jokeable Tension extraction, pattern-diverse candidate generation, and a Visual Joke Critic.
- The Visual Joke Critic ranks or rejects candidates against Visual Joke Taste, Joke Title length, factual support, Joke Target, Earned Edge, and Joke Pattern Diversity.
- The Visual Joke Critic should reject Boring Accuracy.
- The Visual Joke Critic should reject unsupported claims and non-defensible misdirection.
- The Visual Joke Critic should reject condescending, patronizing, or mean-spirited jokes.
- The Visual Joke Critic should reject cheap profanity or shock value that is not Earned Edge.
- The Visual Joke Workflow should include Joke Pattern Diversity rather than returning eight paraphrases of one idea.
- The Visual Joke Workflow should be allowed to generate internal rough candidates but return only polished final candidates.
- The Visual Joke Workflow should include at least one Bold Joke Candidate when the context supports Earned Edge, Named News Actors, or strong Truthful Misdirection.
- Visual Joke Direction is global, system-owned, and separate from User's Direction and User Image Prompt.
- Visual Joke Direction is not editable by the user.
- Visual Joke Direction is inspectable through a quiet UI reveal.
- The Visual Joke Direction reveal shows the full internal prompt exactly as sent.
- Visual Joke Direction is not internally versioned in v3.
- Saved Runs persist the Visual Joke Direction text used for that run because the exact prompt is inspectable.
- User's Direction remains text-generation-only.
- User's Direction does not steer Visual Joke Generation or Image Generation.
- User Image Prompt remains image-generation-only.
- User Image Prompt does not steer Visual Joke Generation.
- Visual Joke Taste favors dark, sharp tech satire.
- Visual Joke Taste should read as a ruthless observer of tech incentives.
- Visual Joke Taste should avoid jokes that are condescending, patronizing, or mean-spirited.
- Joke Target should usually be a system, incentive, product dynamic, company behavior, platform power, market logic, or hype cycle.
- Visual Jokes may name Named News Actors when those actors are central to the news.
- Visual Jokes may use Tech-Native Punchlines, but tech references should not be forced when a sharper joke works without them.
- Visual Jokes may use Truthful Misdirection when the underlying fact is real and defensible.
- Visual Jokes may use Earned Edge when profanity, sexual bluntness, dark humor, or harsh phrasing clarifies the absurdity or strengthens the punchline.
- Sexual bluntness is allowed only when public news involving Named News Actors supports it, and the target remains public behavior or system dynamics rather than private humiliation.
- Visual Jokes should use Context-Supported References and avoid obscure outside knowledge that is not broadly legible or present in the Joke Context Snapshot.
- Joke Context Gathering becomes the shared prerequisite understanding layer for creative result areas.
- Joke Context Gathering supersedes the v2 assumption that outside-X enrichment is the single boundary for both understanding and image discovery.
- Joke Context Gathering must complete before Text Generation and Visual Joke Generation can start.
- Joke Context Gathering failure fails the run before creative branches begin.
- Joke Context Gathering can vary between independent Generation Runs, but the Joke Context Snapshot is fixed once saved.
- Joke Context Gathering produces a Joke Context Snapshot.
- The Joke Context Snapshot uses a fixed Structured Joke Context shape.
- Structured Joke Context includes the source tweet claim, media read, Author Context, Reply Signals, supporting facts, unknowns, Jokeable Tensions, Forbidden Assumptions, and Joke Context Quality.
- Joke Context Quality remains internal.
- The Joke Context Snapshot is visible through a quiet button and modal.
- The Joke Context Snapshot modal shows the full structured context, formatted cleanly.
- The Joke Context Snapshot is not an approval checkpoint.
- The user is not expected to fix or augment context for retries.
- Joke Context Debug Log is available behind a quiet reveal only when Joke Context Gathering fails.
- The main UI shows concise failure states, not full logs.
- Quiet Failure Details apply to failed context and failed creative result areas.
- Tweet Retrieval Service remains responsible for fetching the Source Tweet, replies, author data, metrics, and media references from one retrieval provider.
- Media Understanding Service is separate from Tweet Retrieval Service.
- Media Understanding Service interprets source tweet media after retrieval.
- Media Understanding Service can include OCR, image reading, product UI interpretation, chart reading, and video frame understanding.
- Source Tweet Media Extraction is a first-class part of Joke Context Gathering.
- Media understanding is strongly preferred, but failed media understanding can produce degraded context if the tweet text, replies, author context, and supporting research still provide enough understanding.
- If the Source Tweet text is too thin and media understanding fails to recover the news, Joke Context Gathering should fail instead of guessing.
- Reply Signals should contain structured audience patterns, tensions, jokes, backlash, confusion, corrections, recurring interpretations, and representative snippets.
- Visual Joke Generation does not need to avoid jokes already present in replies.
- Forbidden Assumptions should explicitly mark misleading leaps that are not available to generated jokes.
- News-Linked Image Discovery remains automatic during the initial run.
- News-Linked Image Discovery is separate from Joke Context Gathering.
- News-Linked Image Discovery remains provider-agnostic even if the current implementation uses the existing search provider.
- Image Generation remains unchanged in v3.
- Image Generation continues to use only selected image originals and User Image Prompt.
- Image Generation does not use the Joke Context Snapshot in v3.
- Image Generation remains user-triggered and one-time per Generation Run.
- Image Generation does not regenerate, mutate, or rerank Visual Jokes.
- Text Generation uses the Joke Context Snapshot and User's Direction.
- Text Generation still creates exactly three Drafts.
- Text Generation keeps text-generation-only Provider Fallback.
- Provider Fallback does not apply to Visual Joke Generation.
- Text Generation, Visual Joke Generation, News-Linked Image Discovery, and Image Generation keep independent success and failure states after Joke Context Gathering succeeds.
- A Successful Run requires Joke Context Gathering to succeed and at least one creative result area to succeed.
- No Automatic Retry applies to Joke Context Gathering, Text Generation, Visual Joke Generation, News-Linked Image Discovery, Image Generation, and provider calls.
- There is no regenerate-jokes action in v3.
- A new joke attempt requires a new Generation Run.
- Generation Progress should show compact statuses for context gathering, text generation, news-linked image discovery, visual joke generation, and image generation.
- The Single-Page Workspace should separate text, image, and joke work into clean Creative Result Areas.
- The UI should show not-started or disabled future steps where that makes the workflow clearer.
- The UI should use minimal explanatory copy.
- Saved Runs persist Joke Context Snapshot, Visual Joke Direction, Visual Joke Set, Selected Visual Joke, and independent result states.
- Saved Runs never regenerate Joke Context Snapshot, Drafts, Visual Jokes, or Image Sets when reopened.
- Saved Run Retention remains unchanged from v2: keep only the ten latest successful saved runs, and use the same deletion process.
- Old v1 and v2 PRDs and ADRs should remain as historical documentation until the v3 PRD exists; after v3 is established, older docs may be marked historical or superseded rather than deleted.
- v3 is governed by the ADRs for splitting Joke Context Gathering from News-Linked Image Discovery, separating Tweet Retrieval from Media Understanding, and keeping Visual Joke Service provider-agnostic.

## Testing Decisions

- Good v3 tests should verify observable product behavior at the highest meaningful seam and avoid asserting implementation details such as hook internals, local state shape, prompt text assembly details, or provider-specific helper internals when a higher seam is available.
- The highest-priority seam remains the Single-Page Workspace flow, because v3 is primarily a workflow and result-area change from the operator's perspective.
- Single-Page Workspace tests should cover starting a Generation Run, seeing compact Generation Progress, context gathering running, context gathering completing, Text Generation and Visual Joke Generation starting after context completion, News-Linked Image Discovery running independently, and result areas updating without polling.
- Single-Page Workspace tests should cover the Joke Context Snapshot quiet reveal and verify that it displays the full structured context in a clean user-facing format.
- Single-Page Workspace tests should cover the Visual Joke Direction quiet reveal and verify that it displays the full internal direction text.
- Single-Page Workspace tests should cover a ranked Visual Joke Set displaying all candidates, the first candidate labeled recommended, and no candidate auto-selected by default.
- Single-Page Workspace tests should cover selecting a Visual Joke, persisting that selection, and reopening the Saved Run with the selection intact.
- Single-Page Workspace tests should cover copying individual Visual Jokes.
- Single-Page Workspace tests should verify that Visual Jokes are not editable and do not show visible rationale.
- Single-Page Workspace tests should verify that Visual Joke selection does not gate Image Generation.
- Single-Page Workspace tests should verify that Image Generation does not mutate the Visual Joke Set.
- Single-Page Workspace tests should cover concise failure states and Quiet Failure Details for context and joke failures.
- Single-Page Workspace tests should cover responsive behavior for separated text, image, and joke Creative Result Areas.
- Initial run stream contract tests should cover Joke Context Gathering events, context-completed payloads, joke progress or completion events, News-Linked Image Discovery events, text progress events, and independent failure events.
- Initial run stream contract tests should verify that Text Generation and Visual Joke Generation require a completed Joke Context Snapshot.
- Joke Context Gathering service tests should cover Source Tweet text, media references, media reads, Author Context, Reply Signals, supporting facts, unknowns, Jokeable Tensions, Forbidden Assumptions, and Joke Context Quality in the structured output.
- Joke Context Gathering service tests should cover degraded media understanding when enough non-media context remains.
- Joke Context Gathering service tests should cover failure when tweet text is too thin and media understanding cannot recover the news.
- Media Understanding Service tests should cover OCR-like text extraction, image/product UI interpretation, chart or screenshot summaries, and video-frame summaries through deterministic fakes rather than live model calls.
- Tweet Retrieval Service tests should cover returning media references without taking ownership of media understanding.
- Visual Joke Service tests should cover provider-agnostic input and output shapes, ranked Visual Joke Sets, Visual Joke Metadata, Joke Pattern Diversity, Recommended Visual Joke ordering, and no visible rationale in the returned user surface.
- Visual Joke Service tests should cover rejecting Boring Accuracy.
- Visual Joke Service tests should cover Context-Supported References, Forbidden Assumptions, Truthful Misdirection, Earned Edge, Named News Actors, and Joke Target constraints with deterministic fixtures.
- Visual Joke Service tests should cover one Bold Joke Candidate when the context supports it.
- Visual Joke Service tests should cover no provider fallback and no automatic retry.
- Saved Run persistence tests should cover persisting Joke Context Snapshot, Visual Joke Direction, Visual Joke Set, Selected Visual Joke, independent result states, and reopening without regeneration.
- Saved Run retention tests should confirm that v3 still keeps only the ten latest successful saved runs and uses the existing deletion behavior.
- Runtime contract tests should cover invalid Joke Context Snapshot payloads, invalid Visual Joke Set sizes, missing recommended first joke, invalid Selected Visual Joke references, and invalid Visual Joke Metadata.
- Existing v2 tests for Text Generation, provider fallback, Image Generation, image modal behavior, image selection, and Saved Run retention are prior art and should be extended rather than replaced where possible.
- Provider-specific integration tests should stay narrow and optional because model support, gateway behavior, and external APIs can change.
- Tests should use fake event sources, fake services, deterministic payloads, and fixture media/context rather than live X, search, media-understanding, or model calls.

## Out of Scope

- Placing Visual Jokes onto images.
- Creating final image/title composites.
- Editing Visual Jokes.
- Regenerating Visual Jokes inside an existing Generation Run.
- User-editable Visual Joke Direction.
- Versioning Visual Joke Direction.
- Visual Joke provider fallback.
- Automatic retry for context, jokes, image discovery, image generation, or provider calls.
- Direct publishing to X.
- Changing the existing Image Generation behavior to use the Joke Context Snapshot.
- Changing User Image Prompt behavior.
- Changing User's Direction to influence jokes.
- Changing Saved Run Retention beyond keeping the ten latest successful runs.
- Adding accounts, server persistence, or cross-device continuity.
- Replacing the current image discovery provider as part of this PRD.
- Replacing the current tweet retrieval provider as part of this PRD.

## Further Notes

- The examples that shaped Visual Joke Taste were deliberately sharp. For Bryan Johnson and Kate Tolo's public microbiome post, a strong joke title was framed as "Bryan Johnson and Kate Tolo f**k and it's open-source" because it names central public actors, uses Earned Edge, and translates the story into a Tech-Native Punchline. The target is the public behavior and datafication mindset, not private humiliation.
- For Notion moving from `notion.so` to `notion.com`, strong joke title directions included "Notion is no longer a Somali company" and "After years, Notion is finally leaving Africa." These work because `.so` is a real country-code top-level domain and the joke uses Truthful Misdirection rather than claiming Notion literally moved headquarters.
- The product should preserve the user's mental model: the app does the hard context and joke work, the user judges the output. The user should not become a research assistant, prompt engineer, or debugging participant.
- The v3 PRD intentionally keeps Image Generation stable so the team can focus on the new Visual Joke Generation problem.
- After this PRD becomes the current spec, v1 and v2 PRDs can be marked as historical rather than deleted.
