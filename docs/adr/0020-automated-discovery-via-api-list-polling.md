# Automated Discovery via API List-Timeline Polling

Automated discovery reads the operator's followed accounts through the retrieval provider's API (TwitterAPI.io, per [ADR-0005](0005-provider-agnostic-tweet-retrieval.md)), reconstructed as a small number of operator-owned X Lists — roughly five lists cover ~5000 follows — polled on a fixed schedule behind the provider-agnostic Discovery Service. We chose API polling over browser scroll automation, and we deliberately exclude the algorithmic For You feed from automated scope.

## Why not scroll, and why For You is excluded

Driving the operator's real logged-in X session with a headless browser was the original instinct, but it is fragile (the X DOM churns, anti-bot and login challenges interrupt unattended runs), it is against X's terms (risking the operator's real account with shadow-bans or suspension), and it is hard to keep alive 24/7. API polling is robust, returns structured metrics, and risks no account ban because the provider handles access. The For You feed is algorithmic and personalised, exposed by no API and no stable DOM, so automating it would reintroduce exactly the fragility we rejected. It therefore stays out of the automated path and reaches the product only through manual runs, when the operator pastes a URL.

## The sweep and the qualification pipeline

Tweet discovery runs as a scheduled batch every Y hours over a trailing time window; consecutive windows overlap and a seen-tweet record prevents the same tweet being processed twice. The execution mechanism (cron, worker, or agent) and the value of Y are deliberately deferred.

The provider returns only raw current metrics plus `createdAt` — no virality, velocity, or trending scoring — so the system derives virality itself. A tweet's velocity is its engagement over its age, with reposts weighted strongly, normalised by a per-author baseline so that small and large accounts are judged fairly rather than against one global threshold; baselines are computed lazily. The bar is tuned for recall over precision: it is acceptable to run on a tweet that later fizzles, but not to miss real news. Qualifying viral tweets are grouped into news coverage clusters by semantic similarity within a rolling window, so one news event produces at most one automated run, with the earliest viral tweet as that run's source tweet (ties broken toward media presence, then author authority). A permissive, lightweight LLM newsworthiness filter then drops off-topic viral noise before the expensive run commits; a rejected tweet is dropped permanently. A configurable per-sweep run cap is a cost backstop that ranks by virality and logs what it drops rather than truncating silently.

## Trade-offs

Detection latency is ~Y hours by construction — we traded real-time detection for batch simplicity, accepting that a tweet posted just after a sweep waits for the next one. The provider's support for native engagement and list search operators (`min_retweets:`, `min_faves:`, `list:`) was unconfirmed in its docs and has now been verified empirically (see the spike below): all three pass through, so the sweep lets X pre-filter server-side cheaply rather than pulling full list timelines and filtering client-side.

## Spike (007): X-search-operator passthrough — confirmed

Resolved 2026-06-15 by an operator-driven probe (`scripts/probe-x-search-operators.mjs`) against the real TwitterAPI.io advanced-search endpoint (`GET /twitter/tweet/advanced_search`, params `query` + `queryType`). All three native X search operators pass through and are honored server-side:

- `min_faves:100` — 19/19 returned tweets met the threshold (0 violations) while the unfiltered baseline held 20 sub-threshold tweets.
- `min_retweets:100` — 20/20 met the threshold (0 violations) against 20 sub-threshold tweets in the baseline.
- `list:<id>` — returned a live, multi-author timeline (20 tweets, 9 distinct authors, no literal-text fallback) from a curated list.

**Decision — server-side pre-filter.** The List-timeline retrieval adapter (issue 014) builds each sweep query as `list:<id> min_faves:F min_retweets:R since_time:<unix> until_time:<unix>` and lets X/TwitterAPI.io pre-filter, rather than pulling full list timelines and filtering in-house. Use the `since_time:`/`until_time:` Unix-second operators for the trailing window; the dotted-date forms (`since:YYYY-MM-DD`) are documented as unsupported.

**Cost.** Pages return ~20 tweets. With server-side pre-filtering each Discovery Source List yields only the handful of already-viral tweets in the window, so a sweep over ~5 lists is roughly **5–10 calls** (≈1 page per list, occasionally 2–3 on a heavy news day). The rejected client-side branch would instead page the entire unfiltered list timeline — hundreds-to-thousands of tweets per active list per window, i.e. tens-to-hundreds of pages, on the order of **50–500+ calls** per sweep plus the extra data transfer — one to two orders of magnitude more expensive. This gap is what makes API list-polling viable as the discovery primitive.

**The pre-filter is a coarse recall floor, not the virality bar.** `min_faves:`/`min_retweets:` are global numeric thresholds, whereas author-relative virality scoring (issue 015) still runs in-house on the survivors. So F and R must be set conservatively low — high enough to shed the dead, near-zero-engagement tail cheaply, low enough not to drop a small account's genuine breakout (recall over precision). The exact F/R, like the other discovery numbers, stay deferred config.

**Rate limits.** Observed during the spike: free/zero-balance keys are throttled to ~1 request / 5s (HTTP 429); QPS scales with account balance. The adapter must pace requests and back off on 429, honoring the `x-rate-limit-reset` header (a Unix-second timestamp) and falling back to exponential backoff when it is absent.
