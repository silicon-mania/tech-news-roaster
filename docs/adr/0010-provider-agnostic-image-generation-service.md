# Provider-Agnostic Image Generation Service

In v2, image generation uses a provider-agnostic server-side image generation service rather than exposing a specific image provider in the product model. We prefer Vercel AI Gateway when the configured image model is available there, because it matches the existing generation integration style while keeping the product language centered on selected image originals, user image prompts, and image sets.
