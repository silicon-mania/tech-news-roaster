"use client";

import { useEffect, useRef } from "react";
import type { GenerationRun, SavedRunStore } from "@/services/workspace";

export function useRunAutosave(savedRunStore: SavedRunStore) {
  const autosaveTimeouts = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    return () => {
      for (const timeout of autosaveTimeouts.current.values()) {
        clearTimeout(timeout);
      }

      autosaveTimeouts.current.clear();
    };
  }, []);

  function clearPendingAutosave(runId: string) {
    const currentTimeout = autosaveTimeouts.current.get(runId);

    if (currentTimeout) {
      clearTimeout(currentTimeout);
      autosaveTimeouts.current.delete(runId);
    }
  }

  // Debounced save for free-text edits (draft text, joke title) — successive
  // edits to the same run coalesce into one write.
  function scheduleRunAutosave(run: GenerationRun) {
    clearPendingAutosave(run.id);

    const timeout = setTimeout(() => {
      autosaveTimeouts.current.delete(run.id);
      void savedRunStore.save(run).catch(() => undefined);
    }, 350);

    autosaveTimeouts.current.set(run.id, timeout);
  }

  // Immediate save for discrete selection switches (draft / joke / variation).
  // It cancels any pending debounced save for the same run first, so a stale
  // free-text snapshot can't fire afterwards and clobber the just-saved choice.
  function saveRunNow(run: GenerationRun) {
    clearPendingAutosave(run.id);
    void savedRunStore.save(run).catch(() => undefined);
  }

  return { saveRunNow, scheduleRunAutosave };
}
