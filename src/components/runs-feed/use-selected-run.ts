"use client";

import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useUploadedImageGeneration } from "@/components/image-sets";
import { useRunAutosave } from "@/components/workspace/use-run-autosave";
import { collectCompletedImageSets } from "@/services/generation";
import type { GenerationRun, SavedRunStore } from "@/services/workspace";

/**
 * How long a deleted run is held before the delete actually reaches the store.
 * The Run Card vanishes immediately; within this window the Undo toast can
 * cancel the delete outright, so an undone run is never persisted as deleted.
 */
export const undoDeleteWindowMs = 5000;

type UseSelectedRunArgs = {
  /** The feed's loaded runs — the Selected Run is resolved from this list. */
  runs: GenerationRun[];
  /** The feed's runs setter, so an edit updates the shared list (and the card). */
  setRuns: Dispatch<SetStateAction<GenerationRun[]>>;
  savedRunStore: SavedRunStore;
  /** Injected for tests; defaults to the global `fetch` for the upload stream. */
  uploadImageFetcher?: typeof fetch;
};

type SelectedRun = {
  /** The currently open run, or null when the sidebar is closed. */
  selectedRun: GenerationRun | null;
  /** Open (or switch to) a run's sidebar. */
  selectRun: (runId: string) => void;
  /** Close the sidebar. */
  closeSelectedRun: () => void;
  /** Switch the Selected Draft — updates the card and saves immediately. */
  updateSelectedDraft: (draftId: string | null) => void;
  /** Inline-edit a draft's text — updates the card and autosaves (debounced). */
  updateDraftText: (draftId: string, text: string) => void;
  /** Switch the Selected Generated Image variation — updates the card and saves immediately. */
  updateSelectedGeneratedImage: (imageOptionId: string | null) => void;
  /** Upload an image of the operator's own and generate a new Uploaded Image Set. */
  uploadSelectedRunImage: (file: File) => void;
  /** Whether an Uploaded Image Set generation is in flight (disables the trigger). */
  isUploadGenerating: boolean;
  /**
   * Delete the Selected Run — drops its card and closes the sidebar at once, then
   * commits the delete after an undo window the quiet toast's Undo action cancels.
   */
  deleteSelectedRun: () => void;
};

/**
 * Drives the Selected Run sidebar over the Runs Feed. The open run is resolved
 * from the feed's own list, so every edit — made here through the shared autosave
 * path — updates the card the moment it lands, with no separate preview pane.
 *
 * Persistence mirrors the PRD: a discrete selection switch saves immediately, a
 * free-text edit rides the debounced autosave; there is no save button. Opening a
 * settled, still-unseen run marks it seen, preserving the workspace behavior.
 */
export function useSelectedRun({
  runs,
  setRuns,
  savedRunStore,
  uploadImageFetcher,
}: UseSelectedRunArgs): SelectedRun {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { saveRunNow, scheduleRunAutosave } = useRunAutosave(savedRunStore);
  // Uploading from the sidebar persists immediately (sidebar immediate save),
  // through the same whole-payload save path every discrete selection uses.
  const { generatingRunId, uploadImage } = useUploadedImageGeneration({
    persistRun: saveRunNow,
    setRuns,
    uploadFetcher: uploadImageFetcher,
  });
  // Deferred deletes still inside their undo window, keyed by run id so several
  // can be pending at once.
  const pendingDeleteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const selectedRun = runs.find((run) => run.id === selectedRunId) ?? null;
  const selectedRunSeenAt = selectedRun?.seenAt;
  const selectedRunStatus = selectedRun?.status;

  const selectRun = useCallback((runId: string) => setSelectedRunId(runId), []);
  const closeSelectedRun = useCallback(() => setSelectedRunId(null), []);

  // Opening a run marks it seen — the same behavior as reopening one in the
  // workspace (ADR-0019). Feed runs are Complete (settled), so this fires once;
  // the seenAt is set optimistically and persisted so the marker clears across
  // reloads. A functional update avoids a stale closure on the loaded list.
  useEffect(() => {
    if (!selectedRunId || selectedRunStatus === "running" || selectedRunSeenAt) {
      return;
    }

    const seenAt = new Date().toISOString();

    setRuns((currentRuns) =>
      currentRuns.map((run) =>
        run.id === selectedRunId && !run.seenAt ? { ...run, seenAt } : run,
      ),
    );
    void savedRunStore.markSeen(selectedRunId).catch(() => undefined);
  }, [selectedRunId, selectedRunSeenAt, selectedRunStatus, setRuns, savedRunStore]);

  // On unmount, commit any deletes still inside their undo window rather than
  // dropping them — the operator asked to delete; the window just hadn't elapsed.
  useEffect(() => {
    const timers = pendingDeleteTimers.current;

    return () => {
      for (const [runId, timer] of timers) {
        clearTimeout(timer);
        void savedRunStore.delete(runId).catch(() => undefined);
      }

      timers.clear();
    };
  }, [savedRunStore]);

  function updateSelectedDraft(draftId: string | null) {
    if (!selectedRun) {
      return;
    }

    if (draftId && !selectedRun.drafts.some((draft) => draft.id === draftId)) {
      return;
    }

    const updatedRun: GenerationRun = {
      ...selectedRun,
      selectedDraftId: draftId ?? undefined,
    };

    setRuns((currentRuns) =>
      currentRuns.map((run) => (run.id === updatedRun.id ? updatedRun : run)),
    );
    saveRunNow(updatedRun);
  }

  function updateDraftText(draftId: string, text: string) {
    if (!selectedRun) {
      return;
    }

    const updatedRun: GenerationRun = {
      ...selectedRun,
      drafts: selectedRun.drafts.map((draft) =>
        draft.id === draftId ? { ...draft, text } : draft,
      ),
    };

    setRuns((currentRuns) =>
      currentRuns.map((run) => (run.id === updatedRun.id ? updatedRun : run)),
    );
    scheduleRunAutosave(updatedRun);
  }

  function updateSelectedGeneratedImage(imageOptionId: string | null) {
    if (!selectedRun) {
      return;
    }

    // Only the four generated variations are switchable — never an Image Original —
    // and the option may live in any completed set (source-derived or uploaded),
    // so resolution searches across every set (ADR-0025). A non-variation option
    // or a dangling id is ignored, matching the workspace's image switch.
    if (
      imageOptionId &&
      !collectCompletedImageSets(selectedRun).some((imageSet) =>
        imageSet.options.some(
          (option) => option.id === imageOptionId && option.kind === "variation",
        ),
      )
    ) {
      return;
    }

    const updatedRun: GenerationRun = {
      ...selectedRun,
      selectedGeneratedImage: imageOptionId
        ? { imageOptionId, selectedAt: new Date().toISOString() }
        : null,
    };

    setRuns((currentRuns) =>
      currentRuns.map((run) => (run.id === updatedRun.id ? updatedRun : run)),
    );
    saveRunNow(updatedRun);
  }

  function uploadSelectedRunImage(file: File) {
    if (!selectedRun) {
      return;
    }

    uploadImage(selectedRun.id, file);
  }

  function deleteSelectedRun() {
    if (!selectedRun) {
      return;
    }

    const run = selectedRun;
    const originalIndex = runs.findIndex((candidate) => candidate.id === run.id);

    // Drop the card and close the sidebar at once, but hold the actual
    // store.delete for an undo window so Undo can cancel it outright — an undone
    // delete never touches the store. Delete lives only here, not on the Run
    // Card, so a run can't be removed by accident while scrolling to select.
    setRuns((currentRuns) => currentRuns.filter((candidate) => candidate.id !== run.id));
    setSelectedRunId(null);

    const commitDelete = () => {
      pendingDeleteTimers.current.delete(run.id);
      void savedRunStore.delete(run.id).catch(() => toast.error("Couldn't delete the run"));
    };

    const undoDelete = () => {
      const timer = pendingDeleteTimers.current.get(run.id);

      // Already committed (or undone) — nothing to cancel, and we must not
      // resurrect a card for a run the store has already deleted.
      if (!timer) {
        return;
      }

      clearTimeout(timer);
      pendingDeleteTimers.current.delete(run.id);

      // Put the card back where it was — Undo restores from memory, no re-fetch.
      setRuns((currentRuns) => {
        if (currentRuns.some((candidate) => candidate.id === run.id)) {
          return currentRuns;
        }

        const restored = [...currentRuns];
        restored.splice(originalIndex < 0 ? currentRuns.length : originalIndex, 0, run);

        return restored;
      });
    };

    pendingDeleteTimers.current.set(run.id, setTimeout(commitDelete, undoDeleteWindowMs));

    // A quiet toast confirms (no blocking dialog) and carries the Undo action.
    toast.success("Run deleted", {
      action: { label: "Undo", onClick: undoDelete },
      duration: undoDeleteWindowMs,
    });
  }

  return {
    selectedRun,
    selectRun,
    closeSelectedRun,
    updateSelectedDraft,
    updateDraftText,
    updateSelectedGeneratedImage,
    uploadSelectedRunImage,
    isUploadGenerating: generatingRunId !== null,
    deleteSelectedRun,
  };
}
