# Single Four-Variation Image Set and Automated Selection

> **Status: amended by [ADR-0025](0025-repeatable-uploaded-image-sets.md).** A run is no longer limited to one image set: the operator can upload their own original and generate additional Uploaded Image Sets, repeatedly. The "exactly one image set" and "changing the original requires a new run" claims below are superseded. Everything else here — the four-candidate source-derived set, its locked original, and the automated-selection defaults — still stands and is unchanged for that source-derived set.

This records two related changes to the shape of a run's outputs and to how an automated run fills the choices a manual run leaves to the operator.

## One image set of four variations, with source-tweet media as primary originals

A run now produces exactly one image set of four variations, replacing the earlier shape of up to two sets of two variations. The four image original candidates are drawn first from the source tweet's own media and topped up by news-linked image discovery only when the tweet carries fewer than four usable images — so the source tweet's media, previously used only for understanding, is now a primary generation input. Exactly one original is selected, and it is locked once its four variations exist; changing the original requires a new run. We chose this because it is a tighter, cheaper-to-reason product surface, the tweet's own media is the most news-authentic source for variations, and four variations give the operator real choice while the locked original bounds image-generation cost (the original cannot be swapped without re-paying for generation).

## Automated selection defaults

An automated run reaches a Final Quote Tweet Image with no human input by taking deterministic defaults — the first text draft, the recommended visual joke, the first image original candidate, and the first generated variation — each overridable once the operator opens the run. Overriding is cheap because [ADR-0018](0018-deterministic-derived-final-quote-tweet-image.md) derives the composite on demand from the selections. An automated run still generates all four variations even though it auto-picks the first, specifically so the operator can later switch variation without regenerating. It prepares but never publishes to X; the operator copies or downloads the pieces and posts manually.

## Trade-off

We pay for four image variations on automated runs the operator may never open. We accept that to keep a single image flow shared by manual and automated runs and to preserve the operator's ability to change the variation after the fact.
