import {
  findSelectedVariation,
  findSelectedVisualJoke,
} from "@/components/workspace/quote-tweet-selection";
import {
  deriveAutomatedSelection,
  type QuoteTweetDraft,
  type VisualJoke,
} from "@/services/generation";
import type { RetrievedSourceTweet } from "@/services/tweet-retrieval";
import type { GenerationRun } from "@/services/workspace";

export type ResolvedRunCardContent = {
  /** The commentary draft — the run's Selected Draft, or the first draft. */
  draft: QuoteTweetDraft | undefined;
  /** The visual joke whose Joke Title sits on the Final Quote Tweet Image. */
  visualJoke: VisualJoke | null;
  /** The generated image variation behind the Final Quote Tweet Image. */
  variation: ReturnType<typeof findSelectedVariation>;
  /** The original Source Tweet to embed as the quoted post, if retained. */
  sourceTweet: RetrievedSourceTweet | undefined;
};

/**
 * Resolves the three content slots a Run Card paints — the commentary draft, the
 * visual joke (the Final Quote Tweet Image's title), and the image variation —
 * plus the embedded Source Tweet. Each slot is the operator's explicit choice or,
 * when absent or dangling, the first-of-each fallback **matching Automated
 * Selection** (reused via {@link deriveAutomatedSelection}, never re-derived, so
 * the card and an Automated Run always agree).
 *
 * Pure and display-only: it reads the run and writes nothing, so showing or
 * scrolling the feed persists no selection and a view-only run shows the same
 * defaults on reload.
 */
export function resolveRunCardContent(run: GenerationRun): ResolvedRunCardContent {
  const automatedSelection = deriveAutomatedSelection({
    drafts: run.drafts,
    imageSet: run.imageSet,
    visualJokeSet: run.visualJokeSet,
  });

  const draft =
    run.drafts.find((candidate) => candidate.id === run.selectedDraftId) ??
    run.drafts.find((candidate) => candidate.id === automatedSelection.selectedDraftId) ??
    run.drafts[0];

  const visualJoke =
    findSelectedVisualJoke(run.visualJokeSet, run.selectedVisualJoke ?? null) ??
    findSelectedVisualJoke(run.visualJokeSet, automatedSelection.selectedVisualJoke ?? null);

  const variation =
    findSelectedVariation(run.imageSet, run.selectedGeneratedImage ?? null) ??
    findSelectedVariation(run.imageSet, automatedSelection.selectedGeneratedImage ?? null);

  return {
    draft,
    sourceTweet: run.sourceTweet,
    variation,
    visualJoke,
  };
}
