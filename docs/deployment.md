# Tech News Roaster — Deployment Setup

Use this checklist before deploying. All values are server-only; do not prefix any of
these variables with `NEXT_PUBLIC_`.

## 1. Prepare external services

1. TwitterAPI.io
   - Create or confirm the TwitterAPI.io project used for source tweet and reply retrieval.
   - Copy its API key for `TWITTERAPI_IO_API_KEY`.
   - Confirm the account has enough quota for a paid production smoke run.

2. Vercel AI Gateway
   - In Vercel, enable AI Gateway for the team/project that will host this app.
   - Create an AI Gateway key for `AI_GATEWAY_API_KEY` or use the Vercel-provided
     `VERCEL_AI_GATEWAY_API_KEY`.
   - Confirm the model catalog contains the text models and image model you
     plan to deploy.

3. Outside-X enrichment
   - Use the repository's `/enrich` route or another compatible outside-X enrichment endpoint.
   - If using this repository's `/enrich` route, configure `SERPER_API_KEY` because the route uses
     Serper for outside-X search and news-linked image discovery.
   - Create a shared bearer token for `OUTSIDE_X_ENRICHMENT_API_KEY`.
   - Decide the public `OUTSIDE_X_ENRICHMENT_ENDPOINT`. For the same Vercel deployment, this is
     usually `https://<your-production-domain>/enrich`.

4. Supabase (server-side persistence + multi-operator allowlist auth — required for automated discovery)
   - Create a Supabase project. From Project Settings -> API copy the **Project URL**
     (`SUPABASE_URL`), the **anon** key (`SUPABASE_ANON_KEY`), and the **service_role** key
     (`SUPABASE_SERVICE_ROLE_KEY`). The service-role key is secret — server-only, never
     `NEXT_PUBLIC_`.
   - Apply the database schema. In the Supabase dashboard SQL Editor, run the single
     `supabase/migrations/0001_init.sql`. This creates the run, author-baseline,
     cluster, and seen-tweet tables, their row-level-security policies, **and the private
     `generated-images` storage bucket** — no manual bucket creation needed.
   - Enable email auth. Authentication -> Providers -> **Email** on; the operator signs in with an
     email OTP. For reliable delivery configure SMTP (Authentication -> Emails); the built-in
     sender is heavily rate-limited and is the most common cause of "code could not be sent".
   - Decide the operator emails for `OPERATOR_ALLOWLISTED_EMAILS` (comma-separated). Only these
     addresses can receive a code or create an account; each provisions its own Operator Account
     on first sign-in. The **first entry is the Primary Operator** and is load-bearing (see the
     Discovery Sweep notes below) — always append new teammates, never reorder or drop the first.

## 2. Configure Vercel environment variables

In the Vercel dashboard, open the project, then go to Settings -> Environment Variables. Add these
for the Production environment:

```bash
TWITTERAPI_IO_API_KEY=<twitterapi.io key>
AI_GATEWAY_API_KEY=<vercel ai gateway key>
AI_GATEWAY_OPENAI_MODEL=openai/gpt-5.4-mini
AI_GATEWAY_ANTHROPIC_MODEL=anthropic/claude-sonnet-4.6
AI_GATEWAY_GOOGLE_MODEL=google/gemini-3-flash
AI_GATEWAY_IMAGE_MODEL=google/gemini-2.5-flash-image
OUTSIDE_X_ENRICHMENT_ENDPOINT=https://<your-production-domain>/enrich
OUTSIDE_X_ENRICHMENT_API_KEY=<shared enrichment bearer token>
SERPER_API_KEY=<serper key, if using this repo's /enrich route>
SUPABASE_URL=<supabase project url>
SUPABASE_ANON_KEY=<supabase anon key>
SUPABASE_SERVICE_ROLE_KEY=<supabase service_role key>
OPERATOR_ALLOWLISTED_EMAILS=<comma-separated operator emails; first is the Primary Operator>
APP_BASE_URL=https://<your-production-domain>
DISCOVERY_SOURCE_LIST_IDS=<comma-separated operator-owned X List ids>
CRON_SECRET=<long random secret protecting the sweep route>
```

The model IDs above (`gpt-5.4-mini`, `claude-sonnet-4.6`, `gemini-3-flash`,
`gemini-2.5-flash-image`) are the **current code defaults** and are shown as examples — they may
change. Confirm the live values against `/api/runtime-status`, which reports each configured model
as `available: true` against the gateway catalog.

`APP_BASE_URL` is required for automated runs: a cron-driven run has no incoming request, so it
builds its stored image URLs from this base. Without it those URLs default to `localhost` and are
unreachable in production.

Optional (automated discovery):

```bash
DISCOVERY_SWEEP_LOOKBACK_HOURS=3
```

Optional:

```bash
AI_GATEWAY_BASE_URL=<only if you are not using the default Vercel AI Gateway URL>
OUTSIDE_X_ENRICHMENT_MODEL=google/gemini-3-flash
```

Notes:

- Set either `AI_GATEWAY_API_KEY` or `VERCEL_AI_GATEWAY_API_KEY`; `AI_GATEWAY_API_KEY` is the
  clearest manual dashboard entry.
- If you change any model ID, make sure `/api/runtime-status` reports that model as available
  before running a production smoke test.
- If the outside-X endpoint is hosted somewhere else, set `OUTSIDE_X_ENRICHMENT_ENDPOINT` to that
  service's HTTPS URL and configure the same `OUTSIDE_X_ENRICHMENT_API_KEY` on both sides.

## 3. Deploy

1. Redeploy the Vercel project after saving the Production environment variables.
2. Open `https://<your-production-domain>/api/runtime-status`.
3. Confirm the response reports:
   - `retrieval.mode` as `live`
   - `generation.mode` as `live`
   - `enrichment.mode` as `configured`
   - `generation.aiGateway.catalogReachable` as `true`
   - every configured text and image model as `available: true`
   - `productionReady` as `true`
4. Confirm the runtime-status JSON does not include any secret values.

## 4. Production smoke test

The app lands on the **Runs Feed** at `/`. Start a manual generation from the **New Manual Run**
action, which opens the manual **Workspace** at `/workspace`. (The Workspace and its left-hand runs
sidebar still exist — the feed is just the primary surface now; past runs are reviewed from the
feed.)

1. Open the production app — you land on the Runs Feed.
2. Click **New Manual Run** to open `/workspace`.
3. Paste a direct `x.com` or `twitter.com` status URL.
4. Run one real paid generation.
5. Confirm these areas complete or fail independently and visibly:
   - Generation Progress
   - Text Generation drafts
   - Joke Context Snapshot reveal
   - News-linked image selection
   - Image Generation results
6. Return to the Runs Feed and confirm the completed run appears as a **Run Card**. Click it to open
   the **Selected Run sidebar** and confirm it does not regenerate.
7. Re-pick a different draft or generated image variation, reopen the run again from the feed, and
   confirm the selection persisted.

## 5. Automated Discovery Sweep scheduling

The sweep runs unattended as a **Vercel Cron job** that hits the secured
`/api/discovery-sweep` route. The schedule lives in `vercel.json`:

```json
{
  "crons": [{ "path": "/api/discovery-sweep", "schedule": "0 */2 * * *" }]
}
```

- **Interval Y is every 2 hours** (`0 */2 * * *`). Detection latency is ~Y by design.
  To change the cadence, edit this schedule *and* (if you lengthen it) raise
  `DISCOVERY_SWEEP_LOOKBACK_HOURS` so consecutive trailing windows still overlap.
- **Plan requirement.** A 2-hour cadence needs a Vercel **Pro** plan or above; Hobby
  cron jobs run at most once per day. Confirm the plan before relying on the schedule.
- **Duration.** The route sets `maxDuration = 800`. A sweep composes its kept runs
  sequentially, so wall-clock ≈ per-sweep cap × per-run time; the launch cap (3) is
  sized to finish inside one invocation. Vercel clamps `maxDuration` to the plan /
  Fluid-compute maximum, so confirm the deployment allows enough seconds for
  `cap × per-run time`. If you raise the cap and sweeps risk timing out, move to a
  worker/queue rather than letting runs be cut off.
- **Authentication.** Set a long random `CRON_SECRET` (e.g. `openssl rand -hex 32`).
  Vercel Cron automatically sends it as `Authorization: Bearer <CRON_SECRET>`. The
  route refuses any request without the matching bearer; with no secret set it refuses
  outright in production.
- **Discovery Source.** Set `DISCOVERY_SOURCE_LIST_IDS` to your operator-owned X List
  ids (comma-separated). With none set the route returns 503 and sweeps nothing.
- **The Primary Operator's account must exist first.** A cron request has no session cookie, so
  the sweep resolves the **Primary Operator** — the first entry of `OPERATOR_ALLOWLISTED_EMAILS` —
  through the service-role admin API, and logs the resolved primary each sweep so config drift is
  visible. That auth user only exists once the Primary Operator has **signed in to the app at
  least once** (email OTP). Until then the sweep returns `{ "status": "unauthorized" }` (HTTP 500)
  and starts nothing. So: deploy → have the Primary Operator sign in once → then rely on the cron.
  The first entry is **load-bearing**: reordering or removing it re-anchors discovery under an
  owner with empty seen-tweet/cluster/baseline state and can start duplicate runs — always append
  new teammates rather than changing the first.
- **Readiness gate.** A sweep that finds the Runtime Readiness Gate not ready starts
  nothing that cycle and returns `{ "status": "not-ready" }` (HTTP 200). Confirm
  `/api/runtime-status` reports `retrieval.mode: live`, `persistence.mode: live`, and the
  image model as `available: true` before relying on unattended sweeps. (The gate checks
  boundaries, not whether the operator has signed in —
  that is the separate `unauthorized` case above.)

## 6. Real Discovery Sweep smoke

Operator-driven and occasional, with production keys — separate from the fast,
deterministic fixture suite, which remains the regression guard.

1. Confirm `/api/runtime-status` reports the discovery boundaries ready (section 5).
2. Trigger one sweep by hand against your real Lists (substitute your domain + secret):

   ```bash
   curl -i https://<your-production-domain>/api/discovery-sweep \
     -H "Authorization: Bearer $CRON_SECRET"
   ```

3. Confirm the response is `200` with a summary like
   `{ "status": "completed", "startedRuns": N, "droppedByCap": M, "joinedExistingClusters": K, "runIds": [...] }`.
   `startedRuns` should match the count of distinct viral news events in the trailing
   window (one run per News Coverage Cluster), bounded by the per-sweep cap.
4. Open the **Runs Feed** at `/` and confirm the started runs appear as **automated**,
   marked **unseen**.
5. Trigger the sweep again immediately. Confirm a tweet that joins an already-run
   cluster starts **no second run** (`startedRuns` for the same news is 0;
   `joinedExistingClusters` accounts for it) — the seen-tweet + cluster dedup guarantee.
6. Check the cron logs: any cluster dropped by the per-sweep cap is logged
   (`[discovery-sweep] cap-drop: ...`), never silently discarded.

## 7. Real Automated Run smoke

1. Open one of the runs the sweep started (section 6).
2. Confirm it reached a composed **Final Quote Tweet Image** end to end with no input
   from you, and that Automated Selection picked the first draft, the first image
   original candidate, and the first variation.
3. Confirm the image set has exactly **four variations** and the selected original is
   locked.
4. Confirm **prepare-not-publish**: nothing was posted to X — the run only prepared the
   Final Quote Tweet Image and Selected Draft.
5. Re-pick a different image variation and confirm the Final
   Quote Tweet Image **recomposes instantly with no regeneration**.

## 8. Tuning the discovery configuration

These knobs ship as documented launch defaults; tune them against your live feed.
Each lives in code (change, redeploy) except the interval, which lives in `vercel.json`.

| Knob | Where | Default | Tune when |
| --- | --- | --- | --- |
| Virality bar | `src/services/discovery/virality-config.ts` (`viralityBar`) | `2` | Too few runs → lower it; too much non-news noise surfacing → raise it. |
| Baseline refresh cadence | `virality-config.ts` (`baselineRefreshHours`) | `168` (weekly) | Authors' "normal" drifts fast → shorten; want to cut sampler API cost → lengthen. |
| Per-sweep cap | `src/services/discovery/discovery-sweep-config.ts` (`maxRunsPerSweep`) | `3` | Cap-drop logs show real news being deferred *and* budget + duration allow → raise. |
| Coarse pre-filter floors | `discovery-sweep-config.ts` (`minFaves` / `minReposts`) | `25` / `5` | Small-account breakouts missed → lower; sweeps too noisy/expensive → raise. |
| Clustering threshold | `src/services/discovery/clustering-config.ts` (`similarityThreshold`) | `0.3` | One event makes several runs → lower it; unrelated tweets merged into one run → raise it. |
| Clustering window | `clustering-config.ts` (`clusterWindowMs`) | `6h` | Late coverage re-opens old events → narrow it; the same event keeps starting fresh runs → widen it. |
| Default Image Prompt | `src/services/generation/default-image-prompt.ts` | (working wording) | Generated variations read off-brand or add unwanted text → adjust the wording. |
| Interval Y | `vercel.json` cron `schedule` (+ `DISCOVERY_SWEEP_LOOKBACK_HOURS`) | every 2h / 3h lookback | Want lower latency → run more often; want lower cost → run less often. |

After any change, redeploy and re-run the real Discovery Sweep smoke (section 6) to
confirm the new values behave as intended. The fixture suite (`npm test`) stays the
fast guard against regressions while you tune.

## 9. Visual-joke removal — production cleanup (one-time closeout)

The Visual Joke feature has been removed from the product (ADR-0026). Before this runbook
is considered fully reconciled with production, an operator must complete the one-time
cleanup in [visual-joke-production-cleanup.md](visual-joke-production-cleanup.md) — it
enumerates every environment variable, secret, endpoint, storage bucket, and config item to
check, each with an action or an explicit "nothing to do" note. Delete that doc **and this
section** once the checklist is ticked and the final verification passes.
