## Problem Statement

Tech News Roaster v3 can produce, inside one Generation Run, a ranked Visual Joke Set the user selects from and one or two Image Sets of generated variations. But the two halves never come together. The user ends a run holding a Selected Visual Joke and a set of generated images, then has to leave the app and manually rebuild the Silicon Mania layout in an external tool — dropping the image in, typing the Joke Title, matching the font, the rainbow stripe, the Earth mark, and the black title band by hand — every single time. That manual reassembly is slow, error-prone, and visually inconsistent from one post to the next, which is exactly the work the app exists to remove.

The product already foreshadows the missing step: a Visual Joke is described as "the first readable element on the Quote Tweet image," and a Selected Visual Joke is "persisted for later image/title work." That image/title work does not yet exist.

## Solution

Introduce the **Final Quote Tweet Image**: the shareable image a Generation Run produces by placing one Selected Visual Joke's Joke Title over a user-chosen generated image, using the fixed Silicon Mania layout while leaving every other visual element of that layout unchanged.

The user makes two picks inside the run. They already select one Visual Joke from the Visual Joke Set (the **Selected Visual Joke**, non-editable). They now also select one generated image — the **Selected Generated Image** — by toggling Select on a single variation in the Image Results Area. Originals cannot be selected; only variations (generated Image Options) are eligible.

Once both picks exist, a new Final Quote Tweet Image Creative Result Area renders a **live preview** of the composite: the Selected Generated Image filling the fixed image region, the Joke Title set in the bundled Silicon Mania serif inside the black title band, and the static brand visuals (rainbow top stripe, Earth mark, band) exactly as designed in Figma. The preview updates instantly whenever either selection changes. The only deliberate action is **Download**, which rasterizes the composite to a PNG at the template's native resolution at 2× pixel density, named from the Run Label.

Composition is deterministic and client-side. It does not call an image model, it is not part of the Generation Orchestrator, and it has no provider or failure state of its own. The Final Quote Tweet Image is never stored as bytes: a Saved Run persists only the Selected Generated Image id alongside the existing Selected Visual Joke, and the composite is re-derived from those two selections plus the baked template whenever the run is reopened or downloaded. This is recorded in ADR 0018.

The layout is taken once from Figma node `4016-97` and baked into the repo as committed template assets — static brand visuals, the bundled font file, slot geometry constants — so runtime composition has zero dependency on Figma or its API. A long Joke Title (the common case, since titles skew toward twelve words) auto-fits: it wraps onto multiple lines and shrinks from the design font size down to a legibility floor so it always fits the band without truncation. The generated image fills its slot with cover and center-crop; because the Image Generation prompt already targets the template's image aspect ratio, residual cropping is near zero.

## User Stories

1. As an internal social media operator, I want to assemble the final shareable image inside the app, so that I no longer rebuild the Silicon Mania layout by hand in an external tool.
2. As an internal social media operator, I want the final image to combine my chosen joke and my chosen generated image, so that the post reflects both creative decisions I already made in the run.
3. As an internal social media operator, I want to pick exactly one generated image for the final image, so that there is a single clear picture in the composite.
4. As an internal social media operator, I want to select a generated image by toggling Select directly on that variation in the Image Results Area, so that selection lives where the images already are.
5. As an internal social media operator, I want the Select toggle to mirror how I select a Visual Joke, so that the two selections feel like one consistent gesture.
6. As an internal social media operator, I want only generated variations to be selectable, so that the original news-linked image can never end up in the final image.
7. As an internal social media operator, I want selecting a different variation to replace my previous choice, so that there is always exactly one Selected Generated Image per run.
8. As an internal social media operator, I want to clear my Selected Generated Image by toggling it off, so that I can back out of a choice the same way I clear a Selected Visual Joke.
9. As an internal social media operator, I want the Final Quote Tweet Image to reuse my existing Selected Visual Joke, so that there is one source of truth for which joke is on the image.
10. As an internal social media operator, I want to change the joke on the final image by changing my Selected Visual Joke, so that I do not manage two competing joke selections.
11. As an internal social media operator, I want the joke text placed on the image to stay exactly as generated, so that the non-editable Joke Title is never altered during assembly.
12. As an internal social media operator, I want a live preview of the Final Quote Tweet Image, so that I can see the result immediately instead of clicking a generate button for an instant render.
13. As an internal social media operator, I want the preview to update the moment I change the image or the joke, so that I can compare combinations quickly.
14. As an internal social media operator, I want the static brand visuals (rainbow stripe, Earth mark, black band) to stay identical to the Figma design, so that every post is on-brand and consistent.
15. As an internal social media operator, I want a long Joke Title to shrink and wrap to fit the title band, so that my typical twelve-word headlines are never cut off.
16. As an internal social media operator, I want a short Joke Title to render at the design size, so that short headlines still look like the original layout.
17. As an internal social media operator, I want the joke set in the exact Silicon Mania serif, so that the headline matches the brand typography, ligatures included.
18. As an internal social media operator, I want the generated image to fill its region without letterbox bars, so that the composite matches the template even if proportions differ slightly.
19. As an internal social media operator, I want to download the Final Quote Tweet Image as a high-resolution PNG, so that I can post it without quality loss.
20. As an internal social media operator, I want the downloaded file named from the Run Label, so that I can tell my exports apart.
21. As an internal social media operator, I want the download to look pixel-identical to the preview, so that what I saw is what I post.
22. As an internal social media operator, I want the Final Quote Tweet Image area to appear only once generated variations exist, so that I am not shown an assembler with nothing to assemble.
23. As an internal social media operator, I want a quiet empty state that names the pick I am missing, so that I know whether to choose an image, a joke, or both.
24. As an internal social media operator, I want the area to follow the existing failure pattern when image generation failed entirely, so that the workspace stays consistent with the other creative areas.
25. As an internal social media operator, I want my Selected Generated Image saved with the run, so that reopening the run restores the same final image.
26. As an internal social media operator, I want the Final Quote Tweet Image re-derived on reopen rather than stored as a file, so that reopening never depends on a stale saved picture.
27. As an internal social media operator, I want my selection saved automatically, so that I do not perform a manual save step after picking an image.
28. As an internal social media operator, I want a reopened run with both picks to show the composite immediately, so that I can re-download a past final image without redoing work.
29. As an internal social media operator, I want assembling the final image to require no model call, waiting, or cost, so that it stays instant and effort-less.
30. As an internal social media operator, I want a run with two Image Sets to let me pick a single variation across both sets, so that I am not limited to one set when choosing the picture.
31. As an internal social media operator, I want the preview to remain accurate after the font finishes loading, so that the headline never rasterizes in a fallback typeface.

## Implementation Decisions

- **New domain terms (already in CONTEXT.md):** **Final Quote Tweet Image** and **Selected Generated Image**. The Selected Generated Image is always a variation, never the original, and is distinct from the Selected Image Original (the news-linked input to Image Generation).

- **Deterministic, derived, client-side (ADR 0018):** The Final Quote Tweet Image is produced by deterministic DOM composition, not by an image model, and is not part of the Generation Orchestrator or any provider boundary. It is never persisted as bytes; only the two selection ids are persisted and the composite is re-derived on demand.

- **Persisted selection:** A Saved Run / Generation Run gains one new field for the Selected Generated Image (the chosen variation Image Option id), persisted next to the existing Selected Visual Joke through the same Autosave path that already persists the Selected Visual Joke. One combo per run.

- **Selection validation:** A validator in the generation domain (mirroring `parseSelectedVisualJoke`) resolves and validates the Selected Generated Image: the referenced Image Option id must exist within one of the run's Image Sets and must have `kind: "variation"`. Original Image Options and ids that belong to no Image Set are rejected. As with the Selected Visual Joke, an unresolvable selection degrades to none rather than throwing.

- **Selection UI — Image Results Area:** Each variation Image Option gains a Select / Selected toggle modeled on the Visual Joke Area's existing toggle (`aria-pressed`, re-click clears, single-select). Original Image Options get no toggle. Selection is single across all variations in the run, including when the run has two Image Sets. A selection change invokes a workspace callback analogous to `onSelectedVisualJokeChange`, which updates run state and triggers autosave.

- **New Creative Result Area — Final Quote Tweet Image:** A pure consumer component placed alongside the existing Visual Joke and image-work areas in the run workspace layout. It reads the Selected Generated Image and the Selected Visual Joke from run state and renders the composite. States:
  - Hidden until image generation has produced at least one Image Set with variations.
  - Once variations exist but a pick is missing: a quiet empty state naming the missing pick(s) — image, joke, or both.
  - Both picks present: the live composite preview plus the Download action.
  - Image generation failed entirely (no variations): the existing `CreativeFailureArea` pattern, consistent with the other areas.

- **Composite structure (from Figma `4016-97`):** A fixed portrait frame with a top image region and a bottom black title band. Static layers: rainbow top stripe, Earth mark, black band. Dynamic slots: the Selected Generated Image in the image region (`object-cover`, center anchor) and the Joke Title in the title band (bundled serif, white, left-aligned).

- **Title auto-fit:** The Joke Title wraps and shrinks from the Figma design size down to a defined minimum so it always fits the band height without truncation. The design size is treated as a rarely-hit ceiling because Joke Titles skew long (~12 words). Truncation/ellipsis is explicitly disallowed — a non-editable punchline must never be cut.

- **Image fit:** Cover + center-crop. The Image Generation prompt already requests an aspect ratio close to the template's image region, so cropping is expected to be negligible; cover is the safety rule for any residual mismatch.

- **Rendering & export — DOM + `html-to-image`:** The preview is real DOM; Download captures that exact node via `html-to-image` `toPng({ pixelRatio: 2 })`, yielding preview-equals-download with one renderer. Capture is gated on `document.fonts.ready` so the bundled serif is embedded before rasterization. Output is **PNG**, at the template's native pixel size at 2×. Filename is derived from the Run Label (a helper alongside the existing `buildImageDownloadName`).

- **Rasterizer as an injected dependency:** The function that turns the composite node into a PNG is injected into the Workspace (defaulting to the real `html-to-image` capture), mirroring how `imageGenerationStreamFetcher` and `generationEventSourceFactory` are injected. This keeps Download testable without running `html-to-image` in jsdom.

- **Figma extraction (one-time, baked):** A setup step connects a Figma MCP server (a HITL configuration task) and extracts node `4016-97`: exact font face/weight/size, slot geometry, and the static visuals exported as committed assets. The bundled font ships as a committed `.otf`/`.ttf` (not `next/font/google`) registered via a hand-written `@font-face` used by both the live preview and the rasterization. After extraction, the feature has zero Figma dependency at runtime.

- **Data-URL assumption to verify:** Generated variations appear to arrive as base64 data URLs (`message.images[].image_url.url`) and are persisted that way in the Image Set, so rasterizing them does not taint the canvas. The implementation must confirm this; if a provider ever returns a remote `http` URL, the variation must be fetched and inlined before capture.

## Testing Decisions

Good tests here assert externally observable behavior — what the operator sees and what gets persisted — not internal layout math or the rasterizer's internals. They drive the real `Workspace` at the highest seam, with side-effecting collaborators injected and faked, exactly as the existing workspace tests do.

- **Top seam — `Workspace` (existing `renderWorkspace` + `buildCompletedV3Run`):**
  - A variation Image Option exposes a Select toggle; the original does not. Selecting persists the Selected Generated Image via `savedRunStore.save`; toggling off clears it. Selecting a second variation replaces the first (single-select), including across two Image Sets.
  - The Final Quote Tweet Image area is absent when no variations exist; present with a quiet empty state naming the missing pick when variations exist but a pick is missing; rendering the composite (Joke Title text present, Selected Generated Image present) with a Download action when both picks exist.
  - With both picks present, invoking Download calls the **injected rasterizer** with the composite and offers a PNG named from the Run Label. Prior art: the image-generation tests that assert against the injected `imageGenerationStreamFetcher`, and the saved-run tests that assert against `createMemorySavedRunStore`.
  - Reopening a Saved Run that carries both selections shows the composite immediately (derived, not stored).

- **Composition area component (new, lower seam):** Rendered in isolation across its empty / live / failed states, asserting it surfaces the Joke Title and the Selected Generated Image, and that it shows the failure pattern when image generation failed entirely. Prior art: the focused area component tests under `components/workspace`.

- **Selection validation (existing parse seam):** Unit tests for the Selected Generated Image validator alongside the existing `parseSelectedVisualJoke` tests: accepts a variation id present in an Image Set, rejects an original id, rejects an id belonging to no Image Set, and degrades an unresolvable selection to none. Prior art: `result-states.test.ts` / the visual-joke parse tests.

- **Known limitation:** jsdom has no layout engine, so the auto-fit *computed font size* cannot be asserted. Tests verify the title *renders* (and is never truncated by our own logic), not its pixel size. Likewise, true rasterization fidelity (`html-to-image` output bytes, font embedding) is a browser concern verified manually, not in the unit suite — hence the injected rasterizer for unit tests.

## Out of Scope

- Editing the Joke Title or any text during assembly — Visual Jokes remain non-editable.
- Producing more than one Final Quote Tweet Image per run, or keeping a gallery of combinations.
- Storing the rasterized PNG bytes in browser storage or counting it toward Saved Run Retention.
- Any image model / provider involvement, server-side composition, or Generation Orchestrator changes.
- Live Figma access at runtime, a Figma API key, or re-syncing the template automatically when the Figma design changes.
- Copy-to-clipboard or direct-to-X publishing of the Final Quote Tweet Image (download only for now).
- Posting, scheduling, or any Quote Tweet publish action.
- Smart/subject-aware cropping of the generated image beyond center-anchored cover.
- Changing the Image Generation aspect-ratio prompt (assumed already tuned to the template region).

## Further Notes

- The composite preview and the download share one renderer (the DOM node), so they cannot drift; the single known failure mode is the font-loading race, neutralized by the `document.fonts.ready` guard.
- The `html-to-image` choice is intentionally isolated behind the composition component and is not architecturally load-bearing (ADR 0018) — it can be swapped for a canvas renderer later without touching the domain language, the persisted selections, or the derive-on-demand contract.
- Because the template is baked and the composite is derived, a future template change re-renders all past runs against the new template rather than preserving their original pixels. This is the accepted trade-off for a single-user tool whose template rarely changes.
- Recommended issue ordering for `/to-issues`: (1) HITL Figma MCP connection + one-time extraction and asset/font baking; (2) Selected Generated Image domain field + validator; (3) variation Select toggle in the Image Results Area with autosave; (4) Final Quote Tweet Image composition component (preview, empty/failed states, auto-fit, cover); (5) injected rasterizer + Download (PNG @2×, Run-Label filename); (6) wire the area into the run workspace layout and saved-run reopen path.
