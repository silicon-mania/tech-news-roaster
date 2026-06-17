---
status: accepted
---

# Category-Based, Critic-Less Visual Joke Set

## Context

The Visual Joke Direction prompt (`default-visual-joke-direction.ts`) asks the
model for exactly 21 satirical headlines in three labeled sections of seven —
Satire, Tech-Positive, Experimental — plus the model's own two-to-three top
picks. The v3 pipeline ignored that structure: it produced a flat ranked set of
up to eight jokes, filtered by a local heuristic critic (`evaluateCandidate`,
`selectDiverseCandidates`) over an internal eight-pattern taxonomy
(truthful misdirection, dark tech satire, …), and wrapped the direction in a
competing JSON envelope so the "21 in 3 sections" instruction never reached the
output.

## Decision

The Visual Joke Workflow delivers exactly what the direction asks for. It sends
the Visual Joke Direction (rewritten so its `## format` section requests the JSON
shape directly) and the Joke Context Snapshot to the model and returns a
categorized Visual Joke Set: three Visual Joke Sections targeting seven jokes
each (up to 21) plus an ordered list of Top Picks. We remove the local heuristic
critic, the eight-pattern taxonomy, the per-pattern diversity selection, and the
per-joke Visual Joke Metadata. Each joke carries only `{ id, section, order,
text }`; each Top Pick carries an internal one-line reason. Taste now lives in
the direction and the model's self-selected Top Picks. Automated Selection takes
the first Top Pick.

## Considered Options

- **Keep the eight-pattern critic, layer sections on top.** Rejected: two
  taxonomies on different axes (comedic device vs. who-it-punches-at), and the
  critic's word-count and boring-accuracy gates actively fought the prompt — the
  critic would reject the 13-word tech-positive headline the prompt itself holds
  up as a model, and the Experimental section is designed to break the rules the
  critic enforces.
- **Drop the critic but keep generating a flat list.** Rejected: would not
  deliver the categorized set the prompt and operators expect.

## Consequences

- We trust the model over a deterministic local filter, so the product loses
  programmatic defenses against punching-down, gratuitous profanity,
  misinformation (forbidden assumptions), and boring accuracy. We accept this:
  those defenses now live as guidance inside the direction, and the model's Top
  Picks are its own self-critique.
- Graceful shortfall is preserved per section — the set ships whatever returns
  (as few as one joke overall) with a quiet per-section shortfall notice, rather
  than failing the result area.
- This revises the Visual Joke Workflow internals described in
  [ADR 0017](0017-provider-agnostic-visual-joke-service.md); that ADR's
  provider-agnostic service boundary still stands.
