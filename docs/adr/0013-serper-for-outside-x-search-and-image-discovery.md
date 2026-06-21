Status: The combined search-and-image-discovery boundary framing is superseded by ADR-0015, but this decision still ships — Serper remains the live provider for News-Linked Image Discovery (the `/enrich` route calls `google.serper.dev`).

# Serper for Outside-X Search and Image Discovery

The outside-X enrichment service uses Serper as the first dedicated search provider for article discovery and image discovery. We chose this over relying only on Gemini Grounding with Google Search because the endpoint must return one to five usable image URLs tied to external findings, and Serper's Google-like search and image results better match that hard product contract.
