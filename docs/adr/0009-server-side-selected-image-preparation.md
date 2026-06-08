# Server-Side Selected Image Preparation

For v2 image generation, the browser selects news-linked images but the server fetches and prepares the selected image originals before sending them to the configured image model. We chose this instead of passing remote image URLs directly because image providers can be sensitive to unavailable, hotlinked, or incompatible sources, and the server boundary gives the generation request a stable prepared input.
