# Mandatory Outside-X Enrichment for v2

In v2, outside-X enrichment is mandatory before a generation run can proceed rather than being used only when the source tweet and replies are too thin. We chose this because v2 needs outside-X context both to understand the broader news and to gather news-linked images for user selection before image generation, while still keeping the source tweet as the anchor.
