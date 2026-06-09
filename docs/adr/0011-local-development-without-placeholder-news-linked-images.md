# Local Development Without Placeholder News-Linked Images

Outside-X enrichment remains required for production generation runs, but local development may run without `OUTSIDE_X_ENRICHMENT_ENDPOINT` only by making news-linked images and image generation unavailable. We chose this instead of keeping placeholder image fixtures because placeholder visuals create false confidence in the v2 image workflow; production readiness must include a configured enrichment endpoint, and production runs without it fail before drafts are produced.

For v3, configured development should follow the same live service paths as production. When the required credentials and endpoints for a boundary are present, development must not silently use fixtures, mocks, or local fallback data to avoid real retrieval, media understanding, text generation, visual joke generation, news-linked image discovery, or image generation. Fixture or local modes remain useful only when a boundary is explicitly unconfigured or under test, and runtime status should make those modes visible.

Local or fixture generation must not be used by user-facing v3 Generation Runs when required live configuration is missing. It may remain only as explicit test support; if a local fallback path is no longer used by tests or deliberate fixture workflows, it should be removed from the codebase instead of kept as dead development convenience.

The same rule applies to tweet retrieval. Fixture Source Tweets are acceptable in tests, but user-facing v3 Generation Runs must not generate from fake Source Tweet data when `TWITTERAPI_IO_API_KEY` is missing; the run action should be disabled instead.
