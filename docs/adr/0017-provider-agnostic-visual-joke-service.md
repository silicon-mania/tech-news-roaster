# Provider-Agnostic Visual Joke Service

In v3, visual joke generation runs behind a provider-agnostic visual joke service rather than binding product language or saved-run contracts to a specific AI provider or model. We chose this because the visual joke workflow may combine context use, jokeable tension extraction, pattern-diverse candidate generation, and critic/ranking stages, and those roles may evolve across models or providers while the product concept remains a visual joke set.
