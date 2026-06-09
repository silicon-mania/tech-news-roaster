Status: Historical v2 implementation decision. ADR-0015 supersedes the single outside-X enrichment boundary for v3.

# Bearer Token for Outside-X Enrichment Service

The outside-X enrichment endpoint and the main app caller share a simple `OUTSIDE_X_ENRICHMENT_API_KEY` bearer token. We chose this lightweight gate because the enrichment service is publicly reachable after deployment, but it only needs service-to-service protection that remains portable if the endpoint moves outside this repository.
