# Tech News Roaster v3 Deployment Setup

Use this checklist before deploying version 3. All values are server-only; do not prefix any of
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
   - Confirm the model catalog contains the text models, image model, and visual-joke model you
     plan to deploy.

3. Outside-X enrichment
   - Use the repository's `/enrich` route or another compatible outside-X enrichment endpoint.
   - If using this repository's `/enrich` route, configure `SERPER_API_KEY` because the route uses
     Serper for outside-X search and news-linked image discovery.
   - Create a shared bearer token for `OUTSIDE_X_ENRICHMENT_API_KEY`.
   - Decide the public `OUTSIDE_X_ENRICHMENT_ENDPOINT`. For the same Vercel deployment, this is
     usually `https://<your-production-domain>/enrich`.

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
AI_GATEWAY_VISUAL_JOKE_MODEL=openai/gpt-5.4-mini
OUTSIDE_X_ENRICHMENT_ENDPOINT=https://<your-production-domain>/enrich
OUTSIDE_X_ENRICHMENT_API_KEY=<shared enrichment bearer token>
SERPER_API_KEY=<serper key, if using this repo's /enrich route>
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
   - every configured text, image, and visual-joke model as `available: true`
   - `productionReady` as `true`
4. Confirm the runtime-status JSON does not include any secret values.

## 4. Production smoke test

1. Open the production app.
2. Paste a direct `x.com` or `twitter.com` status URL.
3. Run one paid v3 generation.
4. Confirm these areas complete or fail independently and visibly:
   - Generation Progress
   - Text Generation drafts
   - Joke Context Snapshot reveal
   - Visual Joke Creative Result Area
   - News-linked image selection
   - Image Generation results
5. Reopen the saved run from the drawer and confirm it does not regenerate.
6. Select or clear a visual joke, reopen the run again, and confirm the selection persisted.
