# Local Development Without Placeholder News-Linked Images

Outside-X enrichment remains required for production generation runs, but local development may run without `OUTSIDE_X_ENRICHMENT_ENDPOINT` only by making news-linked images and image generation unavailable. We chose this instead of keeping placeholder image fixtures because placeholder visuals create false confidence in the v2 image workflow; production readiness must include a configured enrichment endpoint, and production runs without it fail before drafts are produced.
