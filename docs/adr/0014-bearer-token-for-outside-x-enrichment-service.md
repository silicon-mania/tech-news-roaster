Status: The v2 single-enrichment-boundary framing is superseded by ADR-0015, but this decision still ships — the `/enrich` route is still protected by the `OUTSIDE_X_ENRICHMENT_API_KEY` bearer token.

# Bearer Token for Outside-X Enrichment Service

The outside-X enrichment endpoint and the main app caller share a simple `OUTSIDE_X_ENRICHMENT_API_KEY` bearer token. We chose this lightweight gate because the enrichment service is publicly reachable after deployment, but it only needs service-to-service protection that remains portable if the endpoint moves outside this repository.
