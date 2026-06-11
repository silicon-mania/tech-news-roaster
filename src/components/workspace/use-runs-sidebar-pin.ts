"use client";

import { useCallback, useEffect, useState } from "react";

const storageKey = "tnr.runs-sidebar.pinned";

/**
 * Tracks whether the runs sidebar is pinned open (Notion-style "lock open"),
 * persisting the choice to localStorage so it survives reloads. Starts
 * collapsed on the server / first paint to avoid a hydration mismatch, then
 * rehydrates from storage on mount.
 */
export function useRunsSidebarPin() {
  const [isPinned, setIsPinned] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setIsPinned(window.localStorage.getItem(storageKey) === "true");
  }, []);

  const togglePinned = useCallback(() => {
    setIsPinned((current) => {
      const next = !current;

      if (typeof window !== "undefined") {
        window.localStorage.setItem(storageKey, String(next));
      }

      return next;
    });
  }, []);

  return { isPinned, togglePinned };
}
