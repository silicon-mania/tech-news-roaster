"use client";

import { type Dispatch, type SetStateAction, useCallback, useEffect, useState } from "react";
import { useRunAutosave } from "@/components/workspace/use-run-autosave";
import type { GenerationRun, SavedRunStore } from "@/services/workspace";

type UseSelectedRunArgs = {
  /** The feed's loaded runs — the Selected Run is resolved from this list. */
  runs: GenerationRun[];
  /** The feed's runs setter, so an edit updates the shared list (and the card). */
  setRuns: Dispatch<SetStateAction<GenerationRun[]>>;
  savedRunStore: SavedRunStore;
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
  /** Switch the Selected Visual Joke — updates the card and saves immediately. */
  updateSelectedVisualJoke: (visualJokeId: string | null) => void;
  /** Inline-edit a visual joke's title — overwrites it and autosaves (debounced). */
  updateVisualJokeTitle: (visualJokeId: string, title: string) => void;
  /** Switch the Selected Generated Image variation — updates the card and saves immediately. */
  updateSelectedGeneratedImage: (imageOptionId: string | null) => void;
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
export function useSelectedRun({ runs, setRuns, savedRunStore }: UseSelectedRunArgs): SelectedRun {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const { saveRunNow, scheduleRunAutosave } = useRunAutosave(savedRunStore);

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

  function updateSelectedVisualJoke(visualJokeId: string | null) {
    if (!selectedRun?.visualJokeSet) {
      return;
    }

    if (visualJokeId && !selectedRun.visualJokeSet.jokes.some((joke) => joke.id === visualJokeId)) {
      return;
    }

    const updatedRun: GenerationRun = {
      ...selectedRun,
      selectedVisualJoke: visualJokeId
        ? { selectedAt: new Date().toISOString(), visualJokeId }
        : null,
    };

    setRuns((currentRuns) =>
      currentRuns.map((run) => (run.id === updatedRun.id ? updatedRun : run)),
    );
    saveRunNow(updatedRun);
  }

  function updateVisualJokeTitle(visualJokeId: string, title: string) {
    if (!selectedRun?.visualJokeSet) {
      return;
    }

    if (!selectedRun.visualJokeSet.jokes.some((joke) => joke.id === visualJokeId)) {
      return;
    }

    // Overwrite the Joke Title within the run's own visual joke set — the original
    // generated title is not retained, exactly as an edited Draft overwrites its
    // text. The card's Final Quote Tweet Image re-derives from this live.
    const updatedRun: GenerationRun = {
      ...selectedRun,
      visualJokeSet: {
        ...selectedRun.visualJokeSet,
        jokes: selectedRun.visualJokeSet.jokes.map((joke) =>
          joke.id === visualJokeId ? { ...joke, text: title } : joke,
        ),
      },
    };

    setRuns((currentRuns) =>
      currentRuns.map((run) => (run.id === updatedRun.id ? updatedRun : run)),
    );
    scheduleRunAutosave(updatedRun);
  }

  function updateSelectedGeneratedImage(imageOptionId: string | null) {
    if (!selectedRun?.imageSet) {
      return;
    }

    // Only the four generated variations are switchable — never the Selected Image
    // Original — so a non-variation option (or a dangling id) is ignored, matching
    // the workspace's image switch.
    if (
      imageOptionId &&
      !selectedRun.imageSet.options.some(
        (option) => option.id === imageOptionId && option.kind === "variation",
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

  return {
    selectedRun,
    selectRun,
    closeSelectedRun,
    updateSelectedDraft,
    updateDraftText,
    updateSelectedVisualJoke,
    updateVisualJokeTitle,
    updateSelectedGeneratedImage,
  };
}
