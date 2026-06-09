# Joke Context Gathering and Image Discovery Split

In v3, joke context gathering becomes the shared understanding layer for text generation and visual joke generation, while news-linked image discovery remains a separate automatic initial-run step for later image generation. We chose this split because v2 outside-X enrichment bundled hidden news understanding with image discovery, but strong visual jokes need richer media-aware context from the source tweet, replies, author context, and supporting research, whereas image generation should keep using only selected images and the user image prompt for now.

This supersedes the v2 assumption that outside-X enrichment is the single enrichment boundary for both understanding the news and gathering image candidates. The older v2 ADRs remain useful historical context, but v3 implementation should treat joke context gathering and news-linked image discovery as distinct product and service boundaries.
