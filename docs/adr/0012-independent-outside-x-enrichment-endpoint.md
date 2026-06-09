Status: Historical v2 implementation decision. ADR-0015 supersedes the single outside-X enrichment boundary for v3.

# Independent Outside-X Enrichment Endpoint

The first outside-X enrichment service lives in this repository as a Vercel-served POST route, but the main app treats it only as the public `OUTSIDE_X_ENRICHMENT_ENDPOINT` contract. We chose this boundary so the service can be deployed and tested alongside the app now, while remaining portable to another project or provider later without changing generation orchestration.
