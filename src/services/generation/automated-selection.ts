import {
  collectCompletedImageSets,
  type ImageSet,
  type SelectedGeneratedImage,
  type SelectedImageOriginal,
  selectedImageOriginalFromCandidate,
  type UploadedImageSetEntry,
} from "./image-generation";
import type { ImageOriginalCandidate } from "./image-original-candidate";
import type { QuoteTweetDraft } from "./quote-tweet-draft";

/**
 * The generated outputs Automated Selection reads. A deliberately narrow subset of
 * a Generation Run — exactly the creative outputs the operator would choose among
 * — so the rule never depends on run-shape internals (ids, status, autosave).
 */
export type AutomatedSelectionResults = {
  drafts: readonly QuoteTweetDraft[];
  imageOriginalCandidates?: readonly ImageOriginalCandidate[];
  imageSet?: ImageSet;
  uploadedImageSets?: readonly UploadedImageSetEntry[];
};

/**
 * The selection fields Automated Selection writes — exactly the ones a Manual Run
 * sets when the operator picks. Each is omitted when its source output was not
 * generated (the run degraded), and each stays overridable once the operator opens
 * the run.
 */
export type AutomatedSelection = {
  selectedDraftId?: string;
  selectedImageOriginal?: SelectedImageOriginal;
  selectedGeneratedImage?: NonNullable<SelectedGeneratedImage>;
};

/**
 * Automated Selection (issue 018): the pure rule that, with no operator, makes the
 * choices a Manual Run leaves to a human — the first text draft as Selected Draft,
 * the first Image Original Candidate as Selected Image Original, and the first
 * generated variation as Selected Generated Image.
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

  const selectedImageOriginal = pickSelectedImageOriginal(results, selectedAt);
  if (selectedImageOriginal) {
    selection.selectedImageOriginal = selectedImageOriginal;
  }

  // The default Selected Generated Image is the first variation across every
  // completed set in order (ADR-0025) — the source-derived set's first variation
  // when present, otherwise the first uploaded set's. Originals are never picked.
  const firstVariation = collectCompletedImageSets(results)
    .flatMap((imageSet) => imageSet.options)
    .find((option) => option.kind === "variation");
  if (firstVariation) {
    selection.selectedGeneratedImage = {
      imageOptionId: firstVariation.id,
      selectedAt,
    };
  }

  return selection;
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
