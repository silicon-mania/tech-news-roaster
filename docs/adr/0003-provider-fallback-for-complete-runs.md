# Provider Fallback For Complete Runs

Generation runs are shown and saved only when three drafts are available, and provider failures are handled by falling back to another successful provider rather than exposing partial runs. We chose this because the product promise is a clean three-draft comparison, but we still disclose duplicate model provenance and a simple explanation when fallback causes more than one draft to come from the same provider.
