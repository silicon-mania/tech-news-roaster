## Problem Statement

Tech News Roaster already has the v1 Single-Page Workspace, run lifecycle, Tweet Retrieval Service boundary, Generation Orchestrator boundary, saved-run behavior, and editorial review UI implemented. The remaining go-live work is to make the existing boundaries explicitly production-ready: real tweet retrieval, real three-provider generation, clear runtime readiness, paid-API visibility in development, and a human-verified production smoke path.

Local development can continue to use fixture tweet context and local draft models when live credentials are missing. Production must never silently use fixture tweet context or local draft models.

## Launch Definition

The first production release is live when every successful Generation Run uses real TwitterAPI.io source tweet and replies retrieval and real Vercel AI Gateway generation across OpenAI, Anthropic, and Google.

Outside-X Enrichment is optional for this release. If no enrichment endpoint is configured, the product can still launch using the source tweet, replies, reply signals, and the user's direction.

## Implementation Scope

### Runtime Status

Add a non-secret runtime status endpoint that reports only integration readiness and mode information. It must never expose credential values.

The endpoint should report:

- retrieval mode: `fixture` or `live`
- generation mode: `local` or `live`
- enrichment mode: `off` or `configured`
- whether required production credentials are present
- whether configured AI Gateway model IDs are available in Vercel AI Gateway
- whether production is ready to start live Generation Runs

Readiness checks should be non-paid by default. The endpoint should not call paid generation providers merely to prove health.

### Development Paid-API Warning

In development, when real API credentials are configured, show a small warning near the `Run` action:

`Live APIs enabled. Runs may use paid quota.`

Developers should switch back to fixture/local mode by removing or blanking local environment variables, not by editing integration code.

### Production Run Guard

In production, the app should render but disable the `Run` action when required live credentials are missing or configured model IDs are unavailable.

Use a short internal-facing message:

`Live integrations are not configured.`

The existing run failure flow remains necessary for live provider outages, revoked credentials, retrieval failures, rate limits, provider credit exhaustion, unavailable source tweets, and other runtime failures after credentials are present.

### AI Gateway Model Configuration

AI Gateway model choices should be configured through environment variables so developers can redeploy with different models without changing code.

Launch defaults:

- `AI_GATEWAY_OPENAI_MODEL=openai/gpt-5.4-mini`
- `AI_GATEWAY_ANTHROPIC_MODEL=anthropic/claude-sonnet-4.6`
- `AI_GATEWAY_GOOGLE_MODEL=google/gemini-3-flash`

Draft cards should show the exact configured model ID as Model Provenance, such as `openai/gpt-5.4-mini`, `anthropic/claude-sonnet-4.6`, or `google/gemini-3-flash`. The existing provider logo supplies provider identity visually.

### Environment Documentation

Update environment documentation so live setup is explicit.

Required for production:

- `TWITTERAPI_IO_API_KEY`
- `AI_GATEWAY_API_KEY` or `VERCEL_AI_GATEWAY_API_KEY`
- `AI_GATEWAY_OPENAI_MODEL`
- `AI_GATEWAY_ANTHROPIC_MODEL`
- `AI_GATEWAY_GOOGLE_MODEL`

Optional:

- `AI_GATEWAY_BASE_URL`
- `OUTSIDE_X_ENRICHMENT_ENDPOINT`

### Deployment Target

Vercel production is the only deployment target for go-live. The implementation should assume the existing Next.js App Router application is deployed as a Vercel project linked to this repository.

Production environment variables should be configured in Vercel. Go-live should not add a separate backend service.

### Access Control

The launch release should not add authentication, an account system, platform-level deployment protection, or app-level access control.

API spend risk is accepted for the internal-company launch and controlled operationally by who receives access to the deployed tool. Authentication can be revisited later if the tool proves useful enough for broader internal usage.

## Acceptance Criteria

- Local development still uses fixture tweet context when `TWITTERAPI_IO_API_KEY` is absent.
- Local development still uses local draft models when AI Gateway credentials are absent.
- Development shows a restrained paid-API warning when live retrieval or generation credentials are configured.
- Production never starts a Generation Run using fixture tweet context or local draft models.
- Production disables the `Run` action when required live credentials are missing or configured model IDs are unavailable.
- Runtime status reports integration modes and readiness without exposing secrets.
- Runtime status validates configured AI Gateway model IDs without making paid generation calls.
- `.env.example` documents all required and optional go-live environment variables.
- Vercel deployment documentation or checklist explains where to configure production environment variables.
- Draft cards show the exact configured AI Gateway model ID used for each Draft.
- One manual paid production smoke run completes with a real X source tweet URL.
- Human editorial review confirms the live drafts are English quote-tweet candidates, meaningfully varied, compact, grounded in retrieved context, and usable enough to copy.

## Human Actions

- Create or confirm a TwitterAPI.io account with access to tweet lookup and replies endpoints.
- Provide the server-only `TWITTERAPI_IO_API_KEY` value.
- Create or confirm Vercel AI Gateway access for OpenAI, Anthropic, and Google models.
- Provide `AI_GATEWAY_API_KEY` or `VERCEL_AI_GATEWAY_API_KEY`.
- Confirm or override the launch model environment variables.
- Link the repository to a Vercel project if it is not already linked.
- Configure production environment variables in Vercel.
- Run the final production smoke test and human editorial review.

## Go-Live Smoke Checklist

1. Confirm runtime status says production is ready.
2. Confirm runtime status does not expose any credential value.
3. Confirm the deployed app accepts a valid direct X/Twitter status URL.
4. Start exactly one paid live Generation Run with a real X source tweet URL.
5. Confirm the Source Tweet Preview shows the retrieved source tweet text, not fixture text.
6. Confirm the run completes with exactly three Drafts.
7. Confirm Draft Model Provenance uses the configured model IDs.
8. Confirm at least two Drafts use meaningfully different Angles.
9. Confirm the Drafts are compact English quote-tweet candidates.
10. Confirm the Drafts do not invent specific facts beyond retrieved context.
11. Confirm at least one Draft reflects the user's direction if the smoke run includes one.
12. Confirm the completed run saves locally and can be reopened without regenerating.

## Out Of Scope

- Making Outside-X Enrichment mandatory for launch.
- Adding authentication, account systems, or access control.
- Adding server-side persistence or cross-device saved runs.
- Adding automated editorial scoring or an LLM judge.
- Adding another backend service outside Next.js and Vercel.
- Adding durable background generation that survives tab closure.
