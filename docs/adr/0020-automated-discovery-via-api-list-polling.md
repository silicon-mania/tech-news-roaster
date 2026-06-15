# Automated Discovery via API List-Timeline Polling

Automated discovery reads the operator's followed accounts through the retrieval provider's API (TwitterAPI.io, per [ADR-0005](0005-provider-agnostic-tweet-retrieval.md)), reconstructed as a small number of operator-owned X Lists — roughly five lists cover ~5000 follows — polled on a fixed schedule behind the provider-agnostic Discovery Service. We chose API polling over browser scroll automation, and we deliberately exclude the algorithmic For You feed from automated scope.

## Why not scroll, and why For You is excluded

Driving the operator's real logged-in X session with a headless browser was the original instinct, but it is fragile (the X DOM churns, anti-bot and login challenges interrupt unattended runs), it is against X's terms (risking the operator's real account with shadow-bans or suspension), and it is hard to keep alive 24/7. API polling is robust, returns structured metrics, and risks no account ban because the provider handles access. The For You feed is algorithmic and personalised, exposed by no API and no stable DOM, so automating it would reintroduce exactly the fragility we rejected. It therefore stays out of the automated path and reaches the product only through manual runs, when the operator pastes a URL.

## The sweep and the qualification pipeline

Tweet discovery runs as a scheduled batch every Y hours over a trailing time window; consecutive windows overlap and a seen-tweet record prevents the same tweet being processed twice. The execution mechanism (cron, worker, or agent) and the value of Y are deliberately deferred.

The provider returns only raw current metrics plus `createdAt` — no virality, velocity, or trending scoring — so the system derives virality itself. A tweet's velocity is its engagement over its age, with reposts weighted strongly, normalised by a per-author baseline so that small and large accounts are judged fairly rather than against one global threshold; baselines are computed lazily. The bar is tuned for recall over precision: it is acceptable to run on a tweet that later fizzles, but not to miss real news. Qualifying viral tweets are grouped into news coverage clusters by semantic similarity within a rolling window, so one news event produces at most one automated run, with the earliest viral tweet as that run's source tweet (ties broken toward media presence, then author authority). A permissive, lightweight LLM newsworthiness filter then drops off-topic viral noise before the expensive run commits; a rejected tweet is dropped permanently. A configurable per-sweep run cap is a cost backstop that ranks by virality and logs what it drops rather than truncating silently.

## Trade-offs

Detection latency is ~Y hours by construction — we traded real-time detection for batch simplicity, accepting that a tweet posted just after a sweep waits for the next one. The provider's support for native engagement and list search operators (`min_retweets:`, `min_faves:`, `list:`) is unconfirmed in its docs and must be verified empirically; if those operators pass through, the sweep can let X pre-filter cheaply, and if not, it pulls list timelines and filters client-side.
