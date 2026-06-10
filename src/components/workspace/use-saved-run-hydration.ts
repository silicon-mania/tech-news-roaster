"use client";

import type { Dispatch, SetStateAction } from "react";
import { useEffect } from "react";
import type { GenerationRun, SavedRunStore } from "@/services/workspace";
import { mergeRuns } from "@/services/workspace";

export function useSavedRunHydration({
  savedRunStore,
  setActiveRunId,
  setRuns,
}: {
  savedRunStore: SavedRunStore;
  setActiveRunId: Dispatch<SetStateAction<string | null>>;
  setRuns: Dispatch<SetStateAction<GenerationRun[]>>;
}) {
  useEffect(() => {
    let isMounted = true;

    void savedRunStore
      .list()
      .then((savedRuns) => {
        if (!isMounted || savedRuns.length === 0) {
          return;
        }

        setRuns((currentRuns) => mergeRuns(currentRuns, savedRuns));
        setActiveRunId((currentActiveRunId) => {
          if (currentActiveRunId) {
            return currentActiveRunId;
          }

          return savedRuns.at(0)?.id ?? null;
        });
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [savedRunStore, setActiveRunId, setRuns]);
}
