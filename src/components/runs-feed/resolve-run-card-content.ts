import { findSelectedVariation } from "@/components/workspace/quote-tweet-selection";
import {
  collectCompletedImageSets,
  deriveAutomatedSelection,
  type QuoteTweetDraft,
} from "@/services/generation";
import type { RetrievedSourceTweet } from "@/services/tweet-retrieval";
import type { GenerationRun } from "@/services/workspace";

export type ResolvedRunCardContent = {
  /** The commentary draft — the run's Selected Draft, or the first draft. */
  draft: QuoteTweetDraft | undefined;
  /** The generated image variation behind the Final Quote Tweet Image. */
  variation: ReturnType<typeof findSelectedVariation>;
  /** The original Source Tweet to embed as the quoted post, if retained. */
  sourceTweet: RetrievedSourceTweet | undefined;
};

/**
 * Resolves the content slots a Run Card paints — the commentary draft and the
 * image variation behind the Final Quote Tweet Image — plus the embedded Source
 * Tweet. Each slot is the operator's explicit choice or, when absent or dangling,
 * the first-of-each fallback **matching Automated Selection** (reused via
 * {@link deriveAutomatedSelection}, never re-derived, so the card and an Automated
 * Run always agree). The composite's headline is the fixed label, not a joke
 * (ADR-0026), so no joke slot is resolved.
 *
 * Pure and display-only: it reads the run and writes nothing, so showing or
 * scrolling the feed persists no selection and a view-only run shows the same
 * defaults on reload.
 */
export function resolveRunCardContent(run: GenerationRun): ResolvedRunCardContent {
  const automatedSelection = deriveAutomatedSelection({
    drafts: run.drafts,
    imageSet: run.imageSet,
    uploadedImageSets: run.uploadedImageSets,
  });

  const imageSets = collectCompletedImageSets(run);

  const draft =
    run.drafts.find((candidate) => candidate.id === run.selectedDraftId) ??
    run.drafts.find((candidate) => candidate.id === automatedSelection.selectedDraftId) ??
    run.drafts[0];

  const variation =
    findSelectedVariation(imageSets, run.selectedGeneratedImage ?? null) ??
    findSelectedVariation(imageSets, automatedSelection.selectedGeneratedImage ?? null);

  return {
    draft,
    sourceTweet: run.sourceTweet,
    variation,
  };
}
