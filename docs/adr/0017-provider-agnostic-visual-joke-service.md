# Provider-Agnostic Visual Joke Service

In v3, visual joke generation runs behind a provider-agnostic visual joke service rather than binding product language or saved-run contracts to a specific AI provider or model. We chose this because the visual joke workflow may combine context use, jokeable tension extraction, pattern-diverse candidate generation, and critic/ranking stages, and those roles may evolve across models or providers while the product concept remains a visual joke set.

For the first v3 live adapter, the implementation should prefer Vercel AI Gateway when it can satisfy the Visual Joke Workflow. This matches the existing generation integration style while keeping saved runs and product contracts centered on Visual Joke Direction, Visual Joke Workflow, Visual Joke Metadata, and Visual Joke Set rather than provider-specific response shapes.

The Visual Joke Workflow should remain a structured workflow contract even when the first adapter performs multiple conceptual stages in one provider call. Tension extraction, pattern-diverse candidate generation, critique and rejection, ranking, and final set validation are product-level expectations; the number of model calls is an adapter detail.

> **Note (revised by [ADR 0022](0022-category-based-critic-less-visual-joke-set.md)):** the workflow internals described above — pattern-diverse candidates, local critique/rejection, and ranking — have been replaced by a category-based, critic-less model (three Visual Joke Sections plus Top Picks). The provider-agnostic service boundary this ADR establishes is unchanged.
