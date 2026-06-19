# Multi-Operator Allowlist with Fan-Out of Automated Runs

The tool moves from a single Operator Account to a small **Operator Allowlist** of
independent accounts (`OPERATOR_ALLOWLISTED_EMAILS`, comma-separated), each signing in
with the existing email-OTP flow. Tweet Discovery still runs **once** per cycle: its
dedup state (seen tweets, author baselines, news coverage clusters) and the single
expensive composition (three-provider text + four image generations) are anchored under
the **Primary Operator** — the first allowlisted email — and each finished Automated Run
is then **duplicated** into every other signed-in operator's account (same run id, copied
payload, copied image bytes) so each operator edits their own copy independently. Manual
runs remain account-specific and are never shared. This amends
[ADR-0019](0019-server-side-persistence-and-single-operator-auth.md)'s single-operator
premise and extends [ADR-0020](0020-automated-discovery-via-api-list-polling.md); it needs
**no schema migration**, since `generation_runs` and the image-bytes bucket are already
keyed by `owner_id`.

## Considered Options

- **Synthetic discovery service account as the anchor** — rejected: it needs a provisioned
  non-login auth user plus extra config to resolve it. Reusing the first real operator as
  the anchor is less infrastructure for a three-person tool, and is invisible to users
  (all operators see identical runs).
- **Sharing the anchor's image bytes instead of copying them** — rejected: it would break
  the "a run and its bytes share one owner" invariant and force the hot image-serving route
  to special-case automated runs by falling back to the anchor owner. Copying keeps serving
  untouched and ownership fully isolated.
- **Backfilling history to a newly signed-in operator** — rejected: forward-only is
  simpler (a new operator receives runs from their first post-signup sweep onward). A
  one-off script can backfill later if ever wanted.

## Consequences

- Automated-run image bytes are stored once **per operator** (~N× storage for the five
  image objects per run) — negligible for an internal tool.
- The first allowlisted email is **load-bearing**: reordering or removing it re-anchors
  discovery under an owner with empty seen-tweet state and can re-process tweets and start
  **duplicate** automated runs (re-incurring generation cost). It must stay stable —
  always append new teammates — and the sweep logs the resolved Primary Operator so drift
  is visible.
- Fan-out is **best-effort per operator**: a failed copy is logged and that operator
  misses just that one run (consistent with No Automatic Retry); the anchor's run and the
  other copies are unaffected.
- An allowlisted operator who has not signed in yet is skipped (no account to copy into)
  and starts receiving runs once provisioned.
