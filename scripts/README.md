# scripts/

Operator-driven, throwaway scripts that make **real, credit-metered** provider calls. They are not
part of the automated test suite (which stays fixture-based, fast, and deterministic — see the
v4 PRD's Testing Decisions) and ship no app code. Run them by hand.

## probe-x-search-operators.mjs — issue 007 spike

Verifies whether the retrieval provider (TwitterAPI.io, per
[ADR-0005](../docs/adr/0005-provider-agnostic-tweet-retrieval.md)) passes through the native X
search operators `list:`, `min_retweets:`, and `min_faves:`. The answer picks the Tweet Discovery
branch that the List-timeline adapter (issue 014) implements:

- **HONORED** → X pre-filters server-side; a Discovery Sweep is a handful of calls.
- **IGNORED** → the sweep pulls full List timelines and applies the virality bar in-house.

### Run

```bash
# min_faves: and min_retweets: tests only (no list)
node --env-file=.env.local scripts/probe-x-search-operators.mjs

# include the list: test against a List you own that has recent activity
PROBE_LIST_ID=1234567890 node --env-file=.env.local scripts/probe-x-search-operators.mjs

# optional cross-check: a username you know is in that list
PROBE_LIST_ID=1234567890 PROBE_LIST_MEMBER=somemember \
  node --env-file=.env.local scripts/probe-x-search-operators.mjs
```

Needs `TWITTERAPI_IO_API_KEY` in the environment; `.env.local` already holds it in dev. The run
makes ~5 provider calls. It prints a per-operator verdict and a final `PASTE THIS BLOCK BACK`
JSON summary.

**Rate limits.** Free TwitterAPI.io keys are throttled to ~1 request / 5s, so the probe paces
itself (`PROBE_DELAY_MS`, default 6000) and retries on HTTP 429 honoring `x-rate-limit-reset` — a
full run takes ~30s, which is expected. Adding a few dollars of balance raises the QPS limit; if you
do, set a smaller `PROBE_DELAY_MS` to speed the run up.

### Tuning (env overrides)

| var | default | purpose |
| --- | --- | --- |
| `PROBE_BASE_TERM` | `AI` | high-volume term so the unfiltered stream has low-engagement tweets to filter |
| `PROBE_MIN_FAVES` | `100` | threshold for the `min_faves:` test |
| `PROBE_MIN_RETWEETS` | `100` | threshold for the `min_retweets:` test |
| `PROBE_QUERY_TYPE` | `Latest` | `Latest` makes an ignored `min_*` filter obvious; `Top` if `Latest` returns 0 |
| `PROBE_DELAY_MS` | `6000` | ms between calls to dodge the free-tier ~1-req/5s rate limit |
| `PROBE_MAX_RETRIES` | `5` | retries on HTTP 429, backoff honoring `x-rate-limit-reset` |
| `PROBE_SEARCH_PATH` | `/twitter/tweet/advanced_search` | override if the provider's path differs |
| `PROBE_LIST_ID` | _(unset)_ | X List id; the `list:` test is skipped when unset |
| `PROBE_LIST_MEMBER` | _(unset)_ | a username known to be in `PROBE_LIST_ID` |

### Reading the verdict

- `min_*` → **HONORED** when every filtered tweet meets the threshold *and* the baseline contained
  sub-threshold tweets. **IGNORED** when sub-threshold tweets come back anyway. **INCONCLUSIVE**
  prints what to change (lower threshold, `Top`, or a higher-volume base term) — re-run.
- `list:` → **LIKELY_HONORED** needs your eyeball: confirm the printed authors are actually members
  of the list. **LIKELY_NOT_HONORED** means empty results or the literal `list:ID` text came back.

Paste the final JSON block back and the finding gets written into
[ADR-0020](../docs/adr/0020-automated-discovery-via-api-list-polling.md).
