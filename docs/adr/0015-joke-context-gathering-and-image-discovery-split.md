# Joke Context Gathering and Image Discovery Split

In v3, joke context gathering becomes the shared understanding layer for text generation and visual joke generation, while news-linked image discovery remains a separate automatic initial-run step for later image generation. We chose this split because v2 outside-X enrichment bundled hidden news understanding with image discovery, but strong visual jokes need richer media-aware context from the source tweet, replies, author context, and supporting research, whereas image generation should keep using only selected images and the user image prompt for now.

This supersedes the v2 assumption that outside-X enrichment is the single enrichment boundary for both understanding the news and gathering image candidates. The older v2 ADRs remain useful historical context, but v3 implementation should treat joke context gathering and news-linked image discovery as distinct product and service boundaries.

For v3, joke context gathering lives in this repository as a server-side service or orchestrator rather than as a separate external endpoint. This keeps the still-new boundary close to the generation stream, media understanding, supporting research, fixtures, and tests while preserving the option to extract it later if the service becomes heavy or reusable enough to justify a separate deployment surface.

Supporting research belongs inside joke context gathering because it helps decide supporting facts, unknowns, named news actors, forbidden assumptions, and jokeable tensions. News-linked image discovery remains a separate image-sourcing boundary for image generation and should not become the owner of the run's editorial understanding.

For v3, news-linked image discovery should wrap the existing outside-X/Serper implementation path as its first provider-agnostic adapter instead of introducing a new image discovery provider. The product and service boundary should speak in terms of news-linked image discovery, while outside-X enrichment remains historical v2 wording.

Runtime status should report the v3 service boundaries separately rather than continuing to group the workflow under the old enrichment and generation labels. Retrieval, media understanding, joke context gathering, news-linked image discovery, text generation, visual joke generation, and image generation should each have compact readiness or degraded-state language so development and production failures point at the right boundary.

The v3 run action should use a strict runtime readiness gate: every service boundary and environment value needed for the full v3 workflow must be configured before any Generation Run can start. Even though creative result areas keep independent success and failure states after a run begins, missing runtime configuration should disable the main run action rather than allowing a partial run to start.

The readiness gate includes tweet retrieval credentials, Vercel AI Gateway credentials, configured text generation models, media understanding model configuration, visual joke generation model configuration, news-linked image discovery endpoint and credentials for the existing Serper-backed adapter path, and image generation model configuration. Everything must be set up before a Generation Run becomes possible.
