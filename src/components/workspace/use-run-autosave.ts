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

  function scheduleRunAutosave(run: GenerationRun) {
    const currentTimeout = autosaveTimeouts.current.get(run.id);

    if (currentTimeout) {
      clearTimeout(currentTimeout);
    }

    const timeout = setTimeout(() => {
      autosaveTimeouts.current.delete(run.id);
      void savedRunStore.save(run).catch(() => undefined);
    }, 350);

    autosaveTimeouts.current.set(run.id, timeout);
  }

  return { scheduleRunAutosave };
}
