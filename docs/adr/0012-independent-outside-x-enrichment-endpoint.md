Status: The v2 single-enrichment-boundary framing is superseded by ADR-0015, but this decision still ships — the `/enrich` route remains the in-repo `OUTSIDE_X_ENRICHMENT_ENDPOINT` contract that News-Linked Image Discovery calls.

# Independent Outside-X Enrichment Endpoint

The first outside-X enrichment service lives in this repository as a Vercel-served POST route, but the main app treats it only as the public `OUTSIDE_X_ENRICHMENT_ENDPOINT` contract. We chose this boundary so the service can be deployed and tested alongside the app now, while remaining portable to another project or provider later without changing generation orchestration.
