# PRD — Upload Your Own Image (Repeatable Uploaded Image Sets)

> Domain terms follow [CONTEXT.md](../../CONTEXT.md). Decisions are anchored by
> [ADR-0025](../adr/0025-repeatable-uploaded-image-sets.md) (amending
> [ADR-0021](../adr/0021-single-image-set-and-automated-selection.md)).

## Problem Statement

When the operator looks at a run — whether a manual run they started or an automated run the system composed — the only original a Final Quote Tweet Image can be built from is one of the four Image Original Candidates drawn from the source tweet's media or news-linked images. If none of those four are good enough, or the operator simply has a better picture in mind, there is no way out: the Selected Image Original is locked once its four variations exist, and changing it "requires a new run." The operator cannot bring their own image into a run and get it stylized like the rest.

## Solution

On any run, the operator can upload a single image of their own and generate four variations from it — the same four-variation Image Set shape they already know — using the system's Default Image Prompt. They can do this as many times as they want per run; every attempt is kept and shown as another Image Set stacked below the others, so the run accumulates a growing gallery of "Image set 1, 2, 3…". Any variation from any set — source-derived or uploaded — can be chosen as the run's single Selected Generated Image that feeds the Final Quote Tweet Image. The uploader is reachable from both surfaces that edit a run (the center workspace and the Runs Feed's Selected Run sidebar), so it works for manual and automated runs alike. On a manual run the operator can even upload before ever generating the candidate-based set, reaching a Complete Run through uploaded images alone.

## User Stories

1. As an operator, I want an "Upload your own image" action on a run's Image Generation section, so that I can bring a picture the candidates do not offer.
2. As an operator, I want that action to be a single icon-only ghost button (an "add image" icon) with a tooltip "Upload your own image", so that it fits the minimalist, label-light UI.
3. As an operator, I want to upload exactly one image per generation, so that each Uploaded Image Set has one clear Uploaded Image Original.
4. As an operator, I want the upload to accept `.jpg`, `.jpeg`, `.png`, and `.webp` files, so that common image formats just work.
5. As an operator, I want an image that is too large or of an unsupported type to be rejected with a quiet toast, so that I learn the constraint without a blocking dialog.
6. As an operator, I want uploading my image to immediately start generating four variations with no extra prompt step, so that it is a one-click action matching the rest of the surface.
7. As an operator, I want every uploaded generation to use the Default Image Prompt regardless of run type, so that the behavior is predictable and I never have to write a prompt.
8. As an operator, I want my uploaded original plus its four generated variations to appear as one Image Set below the existing sets, so that it reads exactly like the Image Set I already understand.
9. As an operator, I want each Image Set labeled uniformly as "Image set N" (no titles, no timestamps), so that the stack stays clean and I can tell sets apart by position.
10. As an operator, I want the newest generated set to appear at the bottom of the stack, so that the order reflects when I made each one.
11. As an operator, I want to upload and generate as many times as I want on a single run, so that I can iterate until I find an image I like.
12. As an operator, I want the upload action disabled while a generation is in flight, so that I do not accidentally start overlapping generations.
13. As an operator, I want a pending placeholder set shown at the bottom of the stack while generation runs, so that I can see it is working.
14. As an operator, I want every Image Set — source-derived and uploaded — to stay visible whenever I reopen the run, so that none of my uploaded work is lost.
15. As an operator, I want to select any variation from any set as the run's picture, so that an uploaded variation can become the Final Quote Tweet Image.
16. As an operator, I want only the four variations (never an original) to be selectable, so that the rules match the existing Image Set behavior.
17. As an operator, I want selecting an uploaded variation to update the Final Quote Tweet Image and the Run Card immediately, so that I see the result without extra steps.
18. As an operator, I want my explicit Selected Generated Image to persist across reloads, so that my choice sticks.
19. As an operator, I want to open any uploaded variation full-screen and download it individually, so that uploaded images get the same inspection and export as generated ones.
20. As an operator, I want the uploader available in the Selected Run sidebar, so that I can upload to an automated run without entering the workspace.
21. As an operator, I want the uploader available in the center workspace too, so that I can upload while finishing a manual run.
22. As an operator on a manual run, I want to upload my own image before (or instead of) generating the candidate-based set, so that I am not forced through candidate selection.
23. As an operator, I want a manual run to reach Complete Run status using uploaded sets alone, so that an upload-only run still appears in the Runs Feed and can become a Quote Repost.
24. As an operator, I want the candidate-based source-derived generation to remain available and unchanged when I have not used it, so that uploading is purely additive.
25. As an operator on an automated run, I want the system to keep auto-selecting the first candidate as before, so that automated runs still reach a Final Quote Tweet Image with no human input.
26. As a developer-operator, I want a failed uploaded generation to be kept in the stack as a failed set, so that I can see which upload failed.
27. As a developer-operator, I want each failed Uploaded Image Set to carry its own Quiet Failure Details (message and debug log) behind a quiet reveal, so that I can diagnose each failure independently.
28. As a developer-operator, I want a failed upload to still show the image I fed it, so that I can correlate the failure with the input.
29. As an operator, I want a failed generation surfaced quietly (toast plus the retained failed set) rather than blocking the UI, so that I can simply upload again to retry.
30. As an operator, I want the default Selected Generated Image (when I have chosen nothing) to be the first available variation across all sets, so that a run with only uploaded sets still has a sensible default.
31. As an operator, I want each Image Set's original and variations to remain individually identifiable, so that selection, full-screen, and download always act on the right image.
32. As an operator, I want downloaded uploaded images to have non-colliding filenames, so that downloading from multiple sets does not overwrite files.
33. As an operator, I want my uploaded images stored under my own account like every other run asset, so that another operator cannot see them.
34. As an operator, I want existing runs created before this feature to keep working untouched, so that nothing I made earlier breaks.

## Implementation Decisions

**Data model — additive (per ADR-0025).** The run keeps its single source-derived `imageSet` / `failedImageSet` (with its Image Original Candidates and locked Selected Image Original — unchanged) and gains an ordered `uploadedImageSets` list. Each entry is a discriminated union of a completed set or a failed set:

```ts
// Shape decided in ADR-0025; carried on the saved run payload.
uploadedImageSets: Array<
  | { status: "completed"; imageSet: ImageSet }
  | { status: "failed"; failedImageSet: FailedImageSet }
>
```

The existing `ImageSet` and `FailedImageSet` shapes are reused verbatim (each already has its own id, options with ids/kind/label, `message`, and `debugLog`). No new per-set selection field is added — `selectedGeneratedImage` stays a single run-wide reference to a globally-unique option id.

**Origin enum.** `imageOriginalCandidateOriginSchema` gains a `'user-uploaded'` value, used by an Uploaded Image Set's Selected Image Original. Uploaded originals are never Image Original Candidates; they are supplied directly.

**Schema / migration.** `savedGenerationRunSchema` adds `uploadedImageSets` as optional (defaulting to empty). Runs persisted before this change parse unchanged (the field is simply absent). No data migration is performed.

**Selected Generated Image resolution.** Resolution and the "first generated variation" default search across `[imageSet, ...uploadedImageSets(completed)]` in order. Only `kind: "variation"` options are selectable; originals never are. A run with only uploaded sets resolves its default to the first uploaded variation.

**Generation service.** The uploaded path reuses the provider-agnostic image generation service and its injected `ImageVariationProvider`. The only new server behavior is preparing the original from uploaded bytes instead of `fetch`ing a remote candidate URL (contrast ADR-0009) — the prepared-original contract (`PreparedSelectedImageOriginal`: data URL + media type + Selected Image Original metadata) is unchanged. The Default Image Prompt is always used.

**New route (shared by both surfaces).** A new server route accepts a multipart upload (one image file + the parent run id), validates type and size server-side, prepares the original, persists the original bytes to owner storage up front, generates four variations, persists their bytes, and streams Server-Sent Events mirroring the existing image-generation stream contract (an `image-set-completed` / `image-set-failed` event then a terminal completion event). Byte persistence and owner scoping reuse `persistImageSetToOwnerStorage`; option URLs are rewritten to the existing `/api/runs/{runId}/images/{optionId}` route, which serves uploaded-set bytes with no change. The route does not itself save the run payload — the client folds the streamed entry into `uploadedImageSets` and saves via the existing run-save route, matching today's image-generation flow.

**Client persistence.** On a completed or failed stream, the client appends the entry to the active/selected run's `uploadedImageSets` and persists the whole run payload (workspace autosave; sidebar immediate save) — the existing whole-payload save path. Because generation is serialized (see below), concurrent appends cannot clobber.

**Concurrency.** No server-side locking. The shared hook exposes a single in-flight state that disables the upload button until the current generation resolves — sufficient for a three-person Operator Allowlist.

**Shared UI.** One shared hook (streaming + state) and one shared component (uploader trigger + per-set rendering) are used by both the workspace `ImageGenerationArea` and the Selected Run sidebar. The trigger is an icon-only ghost `ImagePlus` button with `aria-label` and tooltip "Upload your own image", placed in each surface's Image section header. The per-set renderer reuses the existing Image Set article (horizontal Original + four variations, full-screen modal, individual download) and is labeled "Image set N" by stack position. The sidebar's Image section header gains the action (it was previously a plain title with no controls). The candidate grid + "Start image generation" remain in the workspace exactly as today.

**File constraints.** Picker `accept=".jpg,.jpeg,.png,.webp"`; server accepts `image/jpeg`, `image/png`, `image/webp` (tolerating a stray `image/jpg` content-type); single file; ~10 MB cap. Validation runs client and server.

**Failure handling.** A failed generation produces a failed Uploaded Image Set entry (retaining the persisted uploaded original, plus `message` and `debugLog`) appended to the stack and rendered with the same Quiet Failure reveal the source-derived set uses, accompanied by a non-blocking toast. Consistent with No Automatic Retry — retry is a fresh upload.

**Cost.** Unbounded by design (ADR-0025); no per-run upload cap.

## Testing Decisions

Good tests here assert **external behavior at the established seams**, not internals: given an injected fake image provider (no network), does the service/route produce a completed Image Set of one original + four variations, or a failed set with a debug log? Does the schema round-trip? Does the UI append a set, show the pending skeleton, disable the button mid-flight, reveal failure details, and resolve selection across sets? Tests inject dependencies (`provider`, `prepareSelectedImageOriginal`, `persistImageSet`, `now`) exactly as the current image tests do, and use the in-memory image bytes store and in-memory run repository rather than real Supabase.

Modules and their prior art:

- **Generation service** (`image-generation-service`) — extend `image-generation-service.test.ts`: prepares the original from uploaded bytes and generates four variations with the Default Image Prompt via an injected provider; asserts no remote fetch occurs for the uploaded path.
- **New upload route** — new test mirroring `image-generation/stream/route.test.ts`: feed a multipart `Request`, assert SSE event shapes for both completed and failed paths, using `passthroughPersist` and `createInMemoryImageBytesStore`. Assert it never blocks on the base-set phase gate.
- **Schema** (`generation-run` / `image-generation`) — extend `image-generation.test.ts`: `uploadedImageSets` completed/failed entries round-trip; a legacy payload without the field parses to an empty list.
- **Byte persistence** — reuse `persist-image-set-bytes.test.ts` / `image-bytes-store.test.ts` coverage for the uploaded original and variations under the owner-scoped path; assert non-colliding option ids across multiple sets.
- **Selection resolution** — unit test the cross-set Selected Generated Image resolver and default: only variations selectable; default falls through to the first uploaded variation when no base set exists.
- **Components** — extend `workspace-image-generation.test.tsx` and add sidebar coverage (prior art: `final-image-download.test.tsx`, `selected-run-sidebar`): uploading appends a set, the button disables during generation, a pending skeleton shows, a failed entry exposes its quiet failure reveal, and selecting an uploaded variation updates the Selected Generated Image. Reuse Testing Library patterns already in those files.

## Out of Scope

- Replacing or editing the **source-derived** Image Set, or unlocking its Selected Image Original — ADR-0021 stands for that set.
- Uploading **multiple** images in one action, or generating a count other than four variations per upload.
- A **per-upload prompt** or any prompt UI — uploads always use the Default Image Prompt.
- Deleting or reordering individual Image Sets within a run (sets accumulate; only forward additions are in scope).
- Editing, cropping, or otherwise transforming the uploaded image before generation.
- Any change to text generation, visual joke generation, joke context gathering, or news-linked image discovery.
- Publishing to X — unchanged; the operator still copies/downloads the Quote Repost manually.
- Per-run upload limits, quotas, or cost guards.
- Automated runs auto-uploading anything — automated behavior is unchanged; uploads are a human override.

## Further Notes

- The single `/api/runs/{runId}/images/{optionId}` serving route needs **no change**: uploaded-set option bytes live under the same `${ownerId}/${runId}/${optionId}` storage path and are owner-scoped already (ADR-0019).
- The "first generated variation" default referenced by Run Card and Automated Selection is reinterpreted as "first variation across all sets in order"; for every existing run (which has only the source-derived set) this is identical to today's behavior.
- A manual run that uploads before generating the candidate-based set leaves `imageSet` absent; the candidate grid and "Start image generation" remain available, so the operator can still generate the source-derived set later.
- The minor inconsistency that a manual run's base set uses the user image prompt while its uploaded sets use the Default Image Prompt is intentional and accepted (ADR-0025).
