Status: Historical v2 wording. ADR-0015 supersedes the combined outside-X search and image-discovery boundary; Serper may remain an implementation choice for provider-agnostic News-Linked Image Discovery.

# Serper for Outside-X Search and Image Discovery

The outside-X enrichment service uses Serper as the first dedicated search provider for article discovery and image discovery. We chose this over relying only on Gemini Grounding with Google Search because the endpoint must return one to five usable image URLs tied to external findings, and Serper's Google-like search and image results better match that hard product contract.
