# Repeatable Uploaded Image Sets

This records that a run may now carry more than one image set: beyond the single source-derived set, the operator can upload their own image and generate a fresh set of four variations, repeatedly, on any run. It amends [ADR-0021](0021-single-image-set-and-automated-selection.md), whose "exactly one image set" and "changing the original requires a new run" no longer hold.

## What changed

A run keeps its one source-derived image set (`imageSet` / `failedImageSet`, with its four candidates and locked original — ADR-0021 is unchanged *for that set*) and gains an ordered list of **Uploaded Image Sets**. The operator uploads exactly one image; the server prepares the original from the uploaded bytes (no `fetch` of a remote URL — contrast [ADR-0009](0009-server-side-selected-image-preparation.md)), persists those original bytes to owner storage up front, then generates four variations with the **Default Image Prompt** — always, on manual and automated runs alike, so the new path never needs the run's stored prompt. The finished bytes move into owner storage through the existing `persistImageSetToOwnerStorage` helper and are served by the unchanged `/api/runs/{runId}/images/{optionId}` route ([ADR-0019](0019-server-side-persistence-and-single-operator-auth.md)).

The same uploader is reachable from both surfaces that edit a run — the center workspace and the Runs Feed's Selected Run sidebar — through one shared route, hook, and component. On a manual run it is available even before the source-derived set is generated, so a run may reach a Complete Run through uploaded sets alone, never selecting a candidate. On an automated run it is a purely human, post-hoc override.

## Additive model over a unified list

We keep `imageSet` as a distinct field and add `uploadedImageSets`, rather than collapsing everything into one `imageSets: ImageSet[]`. The source-derived set genuinely differs — it owns the four Image Original Candidates and the ADR-0021 locked-original rule — while an uploaded set is simpler: bytes supplied directly, no candidate selection. The additive shape needs no migration (existing payloads read with an empty `uploadedImageSets`), and the single run-wide Selected Generated Image already references options by globally-unique id, so it resolves to a variation in any set — source-derived or uploaded — with no schema change. The default (nothing explicitly chosen) is the first variation across `[imageSet, ...uploadedImageSets]` in order.

## Failures are retained, not discarded

Each upload attempt is persisted as its own entry — `{status: "completed"}` or `{status: "failed"}` — so a failed generation keeps its own `message` and `debugLog` behind the same Quiet Failure reveal the source-derived set uses. This is a deliberate developer-debugging affordance for a small internal tool: the operator needs to see *which* upload failed and why, per attempt, not a single overwritten failure slot.

## Trade-off

The operator may upload and generate as many times as they like per run, and each upload spends on four image variations with no cap. We accept unbounded image-generation cost: the tool serves a three-person Operator Allowlist, generations are deliberate manual actions, and a count limit would add friction with no real protective value at this scale. Concurrency is handled by disabling the uploader while a generation is in flight — no server-side locking.
