import {
  type ImageSet,
  type SelectedGeneratedImage,
  type SelectedImageOriginal,
  selectedImageOriginalFromCandidate,
} from "./image-generation";
import type { ImageOriginalCandidate } from "./image-original-candidate";
import type { QuoteTweetDraft } from "./quote-tweet-draft";
import type { SelectedVisualJoke, VisualJoke, VisualJokeSet } from "./visual-joke";

/**
 * The generated outputs Automated Selection reads. A deliberately narrow subset of
 * a Generation Run — exactly the four creative outputs the operator would choose
 * among — so the rule never depends on run-shape internals (ids, status, autosave).
 */
export type AutomatedSelectionResults = {
  drafts: readonly QuoteTweetDraft[];
  visualJokeSet?: VisualJokeSet;
  imageOriginalCandidates?: readonly ImageOriginalCandidate[];
  imageSet?: ImageSet;
};

/**
 * The four selection fields Automated Selection writes — exactly the ones a Manual
 * Run sets when the operator picks. Each is omitted when its source output was not
 * generated (the run degraded), and each stays overridable once the operator opens
 * the run.
 */
export type AutomatedSelection = {
  selectedDraftId?: string;
  selectedVisualJoke?: NonNullable<SelectedVisualJoke>;
  selectedImageOriginal?: SelectedImageOriginal;
  selectedGeneratedImage?: NonNullable<SelectedGeneratedImage>;
};

/**
 * Automated Selection (issue 018): the pure rule that, with no operator, makes the
 * four choices a Manual Run leaves to a human — the first text draft as Selected
 * Draft, the first Top Pick visual joke as Selected Visual Joke, the first Image
 * Original Candidate as Selected Image Original, and the first generated variation
 * as Selected Generated Image.
 *
 * Deterministic for the same inputs — a single `now` stamps every selection — and
 * total: any output that was not generated yields no selection rather than
 * throwing. The Automated Run composition consumes this and persists the fields,
 * each still overridable later.
 */
export function deriveAutomatedSelection(
  results: AutomatedSelectionResults,
  options: { now?: () => Date } = {},
): AutomatedSelection {
  const selectedAt = (options.now ?? (() => new Date()))().toISOString();
  const selection: AutomatedSelection = {};

  const firstDraft = results.drafts[0];
  if (firstDraft) {
    selection.selectedDraftId = firstDraft.id;
  }

  const topPickJoke = pickTopPickVisualJoke(results.visualJokeSet);
  if (topPickJoke) {
    selection.selectedVisualJoke = {
      selectedAt,
      visualJokeId: topPickJoke.id,
    };
  }

  const selectedImageOriginal = pickSelectedImageOriginal(results, selectedAt);
  if (selectedImageOriginal) {
    selection.selectedImageOriginal = selectedImageOriginal;
  }

  const firstVariation = results.imageSet?.options.find((option) => option.kind === "variation");
  if (firstVariation) {
    selection.selectedGeneratedImage = {
      imageOptionId: firstVariation.id,
      selectedAt,
    };
  }

  return selection;
}

/**
 * The automated pick is the first Top Pick's joke (the set guarantees at least one
 * Top Pick exists). Falls back to the first joke in the set if — defensively — a
 * hand-built or degraded set carries no Top Picks, so the pick degrades to a
 * sensible choice rather than none. No section is excluded.
 */
function pickTopPickVisualJoke(visualJokeSet?: VisualJokeSet): VisualJoke | undefined {
  if (!visualJokeSet) {
    return undefined;
  }

  const firstTopPickId = visualJokeSet.topPicks[0]?.visualJokeId;
  const topPickJoke = firstTopPickId
    ? visualJokeSet.jokes.find((joke) => joke.id === firstTopPickId)
    : undefined;

  return topPickJoke ?? visualJokeSet.jokes[0];
}

/**
 * The Selected Image Original is the original the run's Image Set was generated
 * from — already the prepared first candidate in a composed run, read straight from
 * the set so it never drifts from the actual generation input. Before an Image Set
 * exists (a degraded run), it derives from the first Image Original Candidate.
 */
function pickSelectedImageOriginal(
  results: AutomatedSelectionResults,
  preparedAt: string,
): SelectedImageOriginal | undefined {
  if (results.imageSet) {
    return results.imageSet.selectedImageOriginal;
  }

  const firstCandidate = results.imageOriginalCandidates?.[0];

  return firstCandidate
    ? selectedImageOriginalFromCandidate(firstCandidate, preparedAt)
    : undefined;
}
