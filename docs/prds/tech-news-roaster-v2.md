## Problem Statement

An internal social media operator already has a fast v1 workflow for turning a tech-news source tweet into three strong quote-tweet drafts. That workflow stops at text, which means the operator still has to leave the product to find a relevant image, decide whether it is good enough, prompt an image model by hand, and keep track of the final visual assets separately from the drafts.

The operator needs v2 to keep the speed and editorial sharpness of v1 while adding a simple visual workflow: mandatory outside-X enrichment should recover the broader news and gather news-linked images, the user should choose one or two of those images, provide one user image prompt, and receive image sets that can be inspected and downloaded alongside the three editable drafts.

## Solution

Extend Tech News Roaster so a generation run remains the parent attempt for a quote tweet, but now includes text generation and optional image generation inside the same saved run.

The user still starts with a source tweet and optional user's direction. The product retrieves the source tweet and replies through the tweet retrieval service, then mandatory outside-X enrichment gathers hidden news context plus one to five news-linked images. Once enrichment is ready, the single-page workspace unlocks a compact image-generation area where the user can select one or two news-linked images and enter the required user image prompt in any order. Text generation starts after enrichment and still produces exactly three drafts, with the draft stack displayed only when all three drafts are available.

Image generation is intentionally user-triggered and one-time per generation run. When the user starts it, the server prepares the selected image originals, discards unselected news-linked images, and the image generation service uses one configured image model to generate exactly two variations for each selected original. Each successful image set contains the selected image original plus Variation 1 and Variation 2. Image sets display as soon as each set is available. Image options are not editable; they can be opened in a full-screen modal with previous/next navigation inside the same image set and downloaded individually.

Saved runs continue to live in browser-only storage, now with retention that keeps only the ten latest successful runs. Reopening a saved run never regenerates drafts or images. If image generation was never started, the saved run can still expose its persisted news-linked images so the user can start the one-time image generation later.

## User Stories

1. As an internal social media operator, I want to paste a source tweet URL into the same primary input, so that v2 keeps the v1 starting workflow.
2. As an internal social media operator, I want invalid source tweet URLs rejected before generation starts, so that I do not wait on a run that cannot use a real source tweet.
3. As an internal social media operator, I want the source tweet to remain the anchor of the generation run, so that outside-X context and images do not replace the post I selected.
4. As an internal social media operator, I want to optionally provide user's direction for text generation, so that I can steer the three drafts.
5. As an internal social media operator, I want user's direction to affect only text generation, so that image generation remains controlled by the user image prompt.
6. As an internal social media operator, I want the product to retrieve replies from the source tweet as before, so that text generation can still use reply signals.
7. As an internal social media operator, I want outside-X enrichment to run for every v2 generation run, so that the product always understands the broader news and can gather images.
8. As an internal social media operator, I want outside-X enrichment to happen before text generation, so that the drafts can use the enriched news context.
9. As an internal social media operator, I want outside-X enrichment to gather one to five news-linked images, so that I have a small visual pool to choose from.
10. As an internal social media operator, I want news-linked images to be directly tied to the underlying news, so that the image options feel relevant to the quote tweet.
11. As an internal social media operator, I want enriched text context to remain hidden, so that the product does not become a noisy research console.
12. As an internal social media operator, I want only news-linked images exposed from outside-X enrichment, so that I can act on the visual part without reading research output.
13. As an internal social media operator, I want the image-generation area to unlock as soon as news-linked images are available, so that I can work on visuals while text generation continues.
14. As an internal social media operator, I want text generation to start after enrichment, so that the three drafts benefit from mandatory outside-X context.
15. As an internal social media operator, I want text generation to still create exactly three drafts, so that comparison remains predictable.
16. As an internal social media operator, I want each completed text generation to normally include one draft from each connected text provider, so that provider variety remains useful.
17. As an internal social media operator, I want provider fallback to stay for text generation, so that a failed text provider does not prevent a complete three-draft result.
18. As an internal social media operator, I want no automatic retry for enrichment, text generation, image generation, or provider calls, so that failures are not hidden behind uncertain waits.
19. As an internal social media operator, I want the draft stack to appear only once all three drafts are available, so that I compare a complete text set.
20. As an internal social media operator, I want text progress to stream while generation runs, so that the waiting state still feels live.
21. As an internal social media operator, I want the run label to update from the text generation flow as before, so that the saved run list remains recognizable.
22. As an internal social media operator, I want each draft to remain editable as plain text, so that v2 does not change the writing workflow.
23. As an internal social media operator, I want draft edits to autosave, so that the latest edited draft text is preserved.
24. As an internal social media operator, I want copied drafts to preserve line breaks, so that the text remains usable when pasted elsewhere.
25. As an internal social media operator, I want model provenance visible on each draft, so that I know which model produced each text option.
26. As an internal social media operator, I want visible rationale to remain available for drafts only, so that explanations stay attached to editorial decisions.
27. As an internal social media operator, I want the source tweet preview visible with the active run, so that I can judge drafts against the original post.
28. As an internal social media operator, I want the compact image-generation area to stay separate from the draft stack, so that visuals do not overpower the text workspace.
29. As an internal social media operator, I want to select one news-linked image before image generation, so that I can generate visuals from the strongest original.
30. As an internal social media operator, I want to select two news-linked images before image generation, so that I can explore two visual directions when the news offers them.
31. As an internal social media operator, I want image selection and user image prompt entry to happen in any order, so that the image workflow feels flexible.
32. As an internal social media operator, I want the image generation button disabled until one or two images are selected and the user image prompt is non-empty, so that accidental image generation cannot start.
33. As an internal social media operator, I want the user image prompt to be required, so that image generation is intentionally steered.
34. As an internal social media operator, I want the user image prompt to be fully freeform, so that I can provide whatever visual instruction I need.
35. As an internal social media operator, I want the same user image prompt applied to both selected images when I select two, so that the image generation step remains simple.
36. As an internal social media operator, I want selecting more than two images prevented immediately, so that I understand the selection limit.
37. As an internal social media operator, I want selected news-linked images to show a subtle selected state, so that I know what will be sent to image generation.
38. As an internal social media operator, I want a third image click to be ignored or gently explained once two are selected, so that the UI does not unpredictably replace my choices.
39. As an internal social media operator, I want to intentionally start image generation with a button, so that the visual phase never begins just because I selected an image.
40. As an internal social media operator, I want image generation to be available while text generation is still running, so that I can save time inside the same parent generation run.
41. As an internal social media operator, I want the parent run to prevent a new source tweet run while text generation or image generation is in flight, so that only one parent generation run is active at a time.
42. As an internal social media operator, I want a text-successful run that is waiting for image action to stop blocking new parent runs, so that optional image generation does not slow down text work.
43. As an internal social media operator, I want no explicit skip-image action, so that moving on remains lightweight.
44. As an internal social media operator, I want a saved run with unstarted image generation to stay eligible for image generation later, so that I can come back to visuals after reviewing drafts.
45. As an internal social media operator, I want image generation to be one-time per generation run, so that I do not have to manage visual versions.
46. As an internal social media operator, I want selected image originals to be prepared server-side before image generation, so that the model receives stable image inputs.
47. As an internal social media operator, I want image generation to use only the selected image originals and the user image prompt, so that visual results are controlled by my prompt rather than hidden editorial context.
48. As an internal social media operator, I want one configured image model used for all image variations, so that image results are comparable.
49. As an internal social media operator, I want the configured image model to be separate from the three text generation models, so that the visual model can be chosen for image quality.
50. As an internal social media operator, I want the configured image model provenance displayed once for the image results area, so that I know which image model was used without seeing repeated metadata.
51. As an internal social media operator, I want image generation to process selected images sequentially, so that the v2 workflow stays simple even if I wait a little longer.
52. As an internal social media operator, I want each selected image original to produce one image set, so that the visual result structure is easy to understand.
53. As an internal social media operator, I want each image set to contain the original plus exactly two generated variations, so that comparison is predictable.
54. As an internal social media operator, I want one provider call per selected image that requests two variations, so that each image set has a clear success or failure boundary.
55. As an internal social media operator, I want each successful image set displayed as soon as it is complete, so that I can inspect visual results without waiting for all selected images.
56. As an internal social media operator, I want no partial variation display inside an image set, so that visual progress remains calm and clear.
57. As an internal social media operator, I want a successful image set persisted even if another selected image fails, so that partial image-generation success is still useful.
58. As an internal social media operator, I want a failed image set to show a lightweight failed state, so that I understand why an expected visual result is missing.
59. As an internal social media operator, I want no retry or fallback model for failed image generation, so that failures remain simple and honest.
60. As an internal social media operator, I want image generation to be considered finished after its one-time attempt, even if one selected image failed, so that I cannot accidentally create versions.
61. As an internal social media operator, I want the image selection pool closed once image generation starts, so that image generation remains a one-time committed action.
62. As an internal social media operator, I want unselected news-linked images discarded once image generation starts, so that saved runs do not waste browser storage.
63. As an internal social media operator, I want selected image originals kept inside successful image sets, so that I can still use the original image if it is the best option.
64. As an internal social media operator, I want original image options and generated variations to have the same expand and download actions, so that the image set behaves consistently.
65. As an internal social media operator, I want image options to be non-editable, so that v2 does not become an image editor.
66. As an internal social media operator, I want to click an image option to open it full-screen, so that I can inspect it before downloading.
67. As an internal social media operator, I want previous and next navigation inside the full-screen modal for the same image set, so that I can compare the original and variations quickly.
68. As an internal social media operator, I want download to apply to the currently displayed image in the modal, so that I can save exactly the image I am inspecting.
69. As an internal social media operator, I want each image option downloadable individually from the image set workflow, so that I can use it outside the app.
70. As an internal social media operator, I want quiet labels like Original, Variation 1, and Variation 2, so that image options are unambiguous.
71. As an internal social media operator, I want per-draft copy and per-image download to remain separate actions, so that the product does not assume a combined publishing workflow.
72. As an internal social media operator, I want no direct publishing to X in v2, so that the product remains a generation and preparation tool.
73. As an internal social media operator, I want a successful run defined by successful enrichment and text generation, so that optional image generation cannot invalidate completed drafts.
74. As an internal social media operator, I want image generation to have its own failed state inside a successful run, so that text work remains preserved.
75. As an internal social media operator, I want the runs list to show phase-aware state when image generation is still in flight, so that I understand what is still running.
76. As an internal social media operator, I want a text-successful run waiting for image action to show a simple waiting-for-image-selection state, so that I know what can still be done.
77. As an internal social media operator, I want failed enrichment to fail the run before text generation starts, so that v2 does not produce a run without news-linked images.
78. As an internal social media operator, I want enrichment with zero news-linked images to fail the run before text generation starts, so that every v2 run can support the image feature.
79. As an internal social media operator, I want the image generation stream to be separate from the initial generation stream, so that image generation can start later or after reopening a saved run.
80. As an internal social media operator, I want the initial generation stream to emit an enrichment-completed event, so that image selection can unlock before text drafts are finished.
81. As an internal social media operator, I want the initial generation stream to continue emitting text progress and completion events, so that v2 preserves the v1 waiting behavior.
82. As an internal social media operator, I want image generation events to stream until complete or failed, so that the UI does not need polling.
83. As an internal social media operator, I want news-linked images to have stable run-local IDs, so that selecting images is reliable.
84. As an internal social media operator, I want image generation to submit selected image IDs rather than raw URLs, so that the server resolves known images from the run.
85. As an internal social media operator, I want news-linked image metadata kept internally but not displayed, so that the app can debug and prepare images without cluttering the UI.
86. As an internal social media operator, I want news-linked images shown in the order returned by outside-X enrichment, so that I can simply choose from the available images.
87. As an internal social media operator, I want no explicit image ranking controls in v2, so that the image selection area stays small.
88. As an internal social media operator, I want outside-X enrichment to be provider-agnostic, so that the product is not tied to Google Search AI even if that is the first implementation.
89. As an internal social media operator, I want image generation to be provider-agnostic at the service boundary, so that changing the configured image model does not change product behavior.
90. As an internal social media operator, I want Vercel AI Gateway preferred when the configured image model is available there, so that image generation matches the existing provider integration style.
91. As an internal social media operator, I want saved runs to persist drafts, draft edits, selected image originals, image sets, user image prompt, model provenance, and dates, so that reopening a run restores the useful work.
92. As an internal social media operator, I want saved runs with unstarted image generation to persist news-linked images, so that I can start image generation later.
93. As an internal social media operator, I want saved runs that already started image generation to omit unselected news-linked images, so that browser storage is conserved.
94. As an internal social media operator, I want the user image prompt persisted only after image generation starts, so that abandoned prompt text is not saved as if it produced images.
95. As an internal social media operator, I want reopening a saved run to never regenerate text drafts, so that saved text work remains stable.
96. As an internal social media operator, I want reopening a saved run to never regenerate image sets, so that saved visual work remains stable.
97. As an internal social media operator, I want browser-only persistence to remain in v2, so that the product does not need accounts or cross-device storage.
98. As an internal social media operator, I want only the ten latest successful saved runs kept automatically, so that image-heavy history does not grow without bound.
99. As an internal social media operator, I want running and failed runs excluded from saved run retention counting, so that the retention limit reflects useful completed work.
100. As an internal social media operator, I want retention to delete the whole saved run, including any persisted news-linked images, so that cleanup is simple and predictable.
101. As an internal social media operator, I want to delete saved runs manually as before, so that I can free space intentionally.
102. As an internal social media operator, I want the single-page workspace to remain dark, minimal, and draft-first, so that v2 still feels like the same focused tool.
103. As an internal social media operator, I want the image-generation area to be secondary to the draft stack, so that text creation remains the primary workflow.
104. As an internal social media operator, I want the app to stay responsive on mobile, so that source tweet, draft, and image workflows remain usable on small screens.
105. As an internal social media operator, I want no visible outside-X research panel, so that the product's value appears through better drafts and usable images.
106. As an internal social media operator, I want all generated drafts and UI copy to remain English, so that v2 stays consistent with v1.
107. As an internal social media operator, I want repeated use of the same source tweet to create independent generation runs, so that each creative attempt remains separate.
108. As an internal social media operator, I want text drafts and image sets to remain independent result areas, so that I can choose text and visuals separately.
109. As a developer, I want outside-X enrichment to return hidden news context plus one to five news-linked images, so that text generation and image selection share the same enrichment boundary.
110. As a developer, I want the initial generation stream to include enrichment, progress, completed, and failed event contracts, so that the client can unlock image selection and display text state without polling.
111. As a developer, I want a separate image-generation stream endpoint, so that image generation can start from a later user action or reopened saved run.
112. As a developer, I want selected image originals resolved server-side from run-local IDs, so that clients do not submit arbitrary image URLs to the image model.
113. As a developer, I want the image generation service to prepare selected image originals before provider calls, so that hotlinked or incompatible image URLs do not make generation brittle.
114. As a developer, I want one image provider call per selected image requesting two variations, so that image set success and failure are easy to model.
115. As a developer, I want image generation to use the configured image model value for provenance, so that operations and the UI reflect the active model.
116. As a developer, I want image generation to prefer Vercel AI Gateway when supported, so that provider access and observability stay aligned with text generation.
117. As a developer, I want runtime contracts for news-linked images, selected image originals, image generation inputs, image sets, and saved run records, so that v2 state remains reliable across client and server boundaries.
118. As a developer, I want saved-run retention enforced in the persistence layer, so that storage cleanup happens consistently.
119. As a developer, I want no automatic retry encoded in enrichment, text generation, or image generation services, so that failures follow product language.
120. As a developer, I want text provider fallback preserved as a distinct behavior from retry, so that v1 reliability remains without violating the no automatic retry rule.

## Implementation Decisions

- The generation run remains the parent object. Text generation and image generation are parts of that parent run rather than separate product-level runs.
- Quote Tweet remains the publish-mode term. Quote repost is treated as an avoided synonym.
- Outside-X enrichment is mandatory in v2 and must complete before text generation starts.
- Outside-X enrichment remains provider-agnostic. Google Search AI or an equivalent provider may implement the first version, but product language and contracts speak in terms of outside-X enrichment.
- Outside-X enrichment returns hidden news context for text generation plus one to five news-linked images for user selection.
- Enriched text context is not shown to the user. News-linked images are the only visible outside-X enrichment output.
- Enrichment with zero news-linked images fails the generation run before text generation starts.
- There is no automatic retry for enrichment failures.
- The initial generation stream should emit an enrichment-completed event before text progress events. That event unlocks image selection and carries the source tweet and news-linked images needed by the client.
- Text generation starts after enrichment and continues to produce exactly three drafts.
- Text generation keeps the v1 one-per-provider default for OpenAI, Anthropic, and Google through the configured text model path.
- Text provider fallback remains in place and is not considered a retry. It continues to preserve a complete three-draft text result when possible.
- The draft stack continues to display only after all three drafts are available.
- Draft progress may still stream before the draft stack appears.
- User's direction remains optional and affects only text generation.
- Image generation is optional, user-triggered, and one-time per generation run.
- Image generation can begin as soon as enrichment has unlocked news-linked images, even while text generation is still running.
- Text generation and image generation may overlap inside the same parent generation run.
- A new parent generation run is blocked while the active parent run has text generation or image generation in flight.
- A text-successful run waiting for image action does not block a new parent generation run.
- There is no explicit skip-image action. A text-successful saved run with unstarted image generation remains eligible for one-time image generation later.
- The image-generation area is compact, secondary to the draft stack, and separate from the text draft result area.
- The user may select one or two news-linked images for image generation.
- The user may enter the user image prompt before or after selecting images.
- The image generation action is enabled only when one or two images are selected and the user image prompt is non-empty.
- The user image prompt is required, fully freeform, and applied to all selected images.
- Selecting more than two images is prevented immediately. The third selection attempt should not silently replace a selected image.
- News-linked images receive stable run-local IDs when enrichment completes.
- The image generation request submits selected image IDs, not raw image URLs.
- Image source metadata may be kept internally for preparation, debugging, and provenance, but is not displayed to the user.
- Selected image originals are fetched and prepared server-side before being sent to the configured image model.
- The image generation service is provider-agnostic. It owns selected image original preparation, configured image model calls, and image set creation.
- Vercel AI Gateway is the preferred image generation integration when the configured image model is available through the gateway.
- The configured image model is separate from the three configured text models and is read from environment configuration.
- Image generation uses only the selected image originals and the user image prompt. Source tweet, replies, and outside-X enriched text are not hidden inputs to image generation.
- Image generation runs selected images sequentially in v2 to keep the workflow simple.
- Each selected image original is processed by one provider call that requests exactly two generated variations.
- Each successful selected image produces one image set.
- Each image set contains the selected image original, Variation 1, and Variation 2.
- The image set is the unit of success or failure. Variation-level partial results are not displayed.
- Image-generation stream events should emit when an image set is complete, not when an individual variation is produced.
- If two images are selected and the first image set succeeds but the second fails, the successful image set remains displayed and persisted.
- A failed image set is recorded as failed and is not retried.
- There is no image generation fallback model in v2.
- Once image generation starts, image selection is closed and cannot be reopened for that run.
- Once image generation starts, unselected news-linked images are discarded to conserve browser storage.
- If text generation succeeds and image generation has not started, news-linked images remain persisted so the saved run can start image generation later.
- The user image prompt is persisted only after image generation starts.
- Image options are non-editable.
- Image options can be opened in a full-screen modal.
- The full-screen modal supports previous and next navigation within the same image set.
- Download applies to the currently displayed image.
- Original image options and generated variations share the same expand and download actions.
- Text draft copy and image download remain separate actions.
- There is no combined copy-and-download action in v2.
- There is no direct publishing to X in v2.
- Original, Variation 1, and Variation 2 are quiet labels inside each image set.
- The configured image model provenance is displayed once for the whole image results area, not repeated on each generated variation.
- A successful run is defined by successful outside-X enrichment and text generation, regardless of optional image generation success or failure.
- Image generation has its own in-flight and failed states inside a successful run.
- The runs list and active run should be phase-aware: enrichment running, text generation running, waiting for image selection, image generation running, image generation partially failed, or image generation complete.
- Browser-only persistence remains the persistence model for v2. There is no account system, server persistence, or cross-device continuity.
- Saved runs persist source tweet, user's direction, draft text and latest edits, model provenance, selected image originals, image sets, committed user image prompt, dates, and enough metadata to reopen the run without regeneration.
- Saved runs with unstarted image generation persist news-linked images until image generation starts.
- Saved runs where image generation has started do not persist unselected news-linked images.
- Saved run retention keeps only the ten latest successful saved runs.
- Running and failed runs do not count toward the ten-run retention limit.
- Retention deletes the whole saved run, including persisted news-linked images and image sets.
- Reusing the same source tweet creates an independent generation run.
- Saved runs never regenerate drafts or images when reopened.
- The existing dark, minimalist, single-page workspace remains the product surface.
- The source tweet preview remains visible with the active run.
- The primary user-facing result remains the draft stack. The image-generation area adds visual options without turning the app into a research panel or image editor.
- Zod runtime contracts should cover news-linked images, enrichment-completed events, image-generation input, image set events, image failed events, completed run payloads, and saved run records.
- The generation, retrieval, enrichment, text orchestration, image generation, and persistence concerns should remain distinct at route/service boundaries even if they all live in the Next.js application.
- The current ADRs apply to v2, especially provider fallback, provider-agnostic tweet retrieval, server-side generation orchestration, mandatory outside-X enrichment, browser-only image persistence with retention, server-side selected image preparation, and provider-agnostic image generation service.

## Testing Decisions

- A good v2 test should verify observable behavior at the highest meaningful seam and avoid asserting implementation details such as hook internals, local state shape, or provider-specific helper internals when a higher behavior seam is available.
- The highest-priority seam remains the single-page workspace flow. Tests at this seam should cover starting a generation run, enrichment unlocking news-linked images, text progress continuing independently, draft stack display only after all three drafts, image selection, required user image prompt gating, image generation start, image set display, image modal behavior, download affordances, saved-run reopening, and retention effects.
- Existing single-page workspace tests are the main prior art for v2 because they already cover valid and invalid source tweet URL handling, running run creation, SSE-driven progress updates, run label updates, complete three-draft display, inline editing, copy behavior, saved run reopening, same-source independent runs, and deletion.
- Initial generation stream route contract tests should cover enrichment-completed events, progress events, completed text run events, failed enrichment with zero news-linked images, failed enrichment service responses, and no automatic retry behavior.
- Image-generation stream route contract tests should cover selected image ID validation, required user image prompt validation, one or two selected images, image set completed events, image set failed events, sequential image set emission, and no automatic retry behavior.
- Generation orchestrator tests should continue to cover one-per-provider happy path, text provider fallback, fallback disclosure, complete text result contracts, and no retry behavior.
- Outside-X enrichment service tests should cover mandatory enrichment, hidden text context, one to five news-linked images, stable run-local IDs, zero-image failure behavior, and provider-agnostic output shape.
- Image generation service tests should cover selected image original preparation, provider-agnostic input/output shape, configured image model provenance, one provider call per selected image, two generated variations per image set, image set failure boundaries, and no fallback model behavior.
- Saved run persistence tests should cover v2 saved run shape, persistence of news-linked images before image generation starts, discarding unselected news-linked images after image generation starts, persisting selected image originals and successful image sets, preserving failed image set state, committed user image prompt persistence, and reopening without regeneration.
- Saved run retention tests should cover keeping only the ten latest successful runs, excluding running and failed runs from the count, deleting the whole saved run during retention cleanup, and preserving the latest edited drafts and image sets for retained runs.
- Client state tests should cover the phase-aware active run states: enrichment running, text generation running, image selection unlocked, waiting for image selection after text success, image generation running, image generation partially failed, and image generation complete.
- Modal tests should cover opening a clicked image option, navigating previous and next within an image set, and downloading the currently displayed image.
- Copy-related tests should remain focused on text drafts and verify that v2 does not couple draft copy to image download.
- Tests should prefer fake event sources, fake services, and deterministic payloads over live provider calls.
- Provider-specific integration tests, if added, should stay narrow and optional because Vercel AI Gateway model support and slugs can change.
- Runtime contract tests should make failures explicit: invalid selected image IDs, missing user image prompt, selecting more than two images, zero news-linked images, image model failure, and attempted second image generation for the same run.

## Out of Scope

- Direct publishing to X.
- Combined text-and-image export.
- More than three text drafts.
- More than one image generation attempt per generation run.
- More than two selected news-linked images per image generation.
- More than two generated variations per selected image.
- Image editing controls or regeneration controls.
- User-selectable image model controls in the UI.
- Image prompt presets or image prompt policy constraints beyond non-empty validation.
- Displaying enriched text context to the user.
- Displaying image source metadata to the user.
- User-facing image ranking, filtering, or search inside news-linked images.
- Automatic retry for enrichment, text generation, image generation, or provider calls.
- Image generation fallback models.
- Parallel image generation for selected images in v2.
- Server-side saved run persistence.
- Accounts, teams, cross-device continuity, or shared saved runs.
- Durable background generation that survives closing the page.
- Reopening image selection after image generation starts.
- Saving unselected news-linked images after image generation starts.
- Multi-language UI or multi-language draft generation.
- Publish modes other than Quote Tweet.

## Further Notes

- v2's product bet is that a quote tweet is stronger when the operator can prepare both a witty text draft and a directly relevant visual without leaving the workspace.
- The image feature should prove value quickly rather than solve every visual workflow. Sequential processing, one-time image generation, no image editing, and browser-only persistence are deliberate simplifications.
- The product should not become a research dashboard. Outside-X enrichment is mandatory in v2, but its text output remains hidden and its image output is exposed only because the user must select from it.
- The core text workflow should feel almost unchanged from v1. The image workflow is additive and should not slow down text draft review when the user does not need visuals immediately.
- The system should be honest about failures. Text provider fallback remains because it produces the required three-draft comparison, but failed enrichment and image generation are not retried or hidden.
- The configured image model should be treated as operational configuration and model provenance. The product language should continue to speak in terms of image generation service, selected image originals, user image prompts, image sets, and image options.
- Vercel AI Gateway currently supports image generation and editing capabilities, including Google/Gemini image-capable models, which makes it a reasonable preferred integration path when the configured model is available there.
