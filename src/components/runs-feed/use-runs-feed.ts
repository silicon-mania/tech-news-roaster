"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerationRun, SavedRunStore } from "@/services/workspace";
import { isCompleteRun } from "@/services/workspace";

// The client-supplied page size for the Runs Feed. The feed pages through the
// existing offset pagination at this size and is the visible target a single
// load fills toward — chosen deliberately to keep first paint light given how
// tall full quote-repost cards are (PRD). Easy to tune in one place.
export const feedPageSize = 14;

type RunsFeed = {
  /** The Complete Runs loaded so far, newest-first (the store sorts by savedAt). */
  runs: GenerationRun[];
  /** Whether more pages remain to load. */
  hasMore: boolean;
  /** True while a page is being fetched (initial load or scroll). */
  isLoading: boolean;
  /** Callback ref for the bottom sentinel; scrolling it into view loads the next page. */
  setSentinel: (node: HTMLDivElement | null) => void;
};

/**
 * Drives the Runs Feed off the injected {@link SavedRunStore}: it pages through
 * the existing `listPaginated` (offset cursor, `saved_at DESC`) at
 * {@link feedPageSize}, drops runs that fail {@link isCompleteRun}, and keeps
 * fetching further pages within a single load until it has gathered a full page
 * of Complete Runs (or runs out). Completeness is computed client-side — the API
 * is unchanged. Scrolling the sentinel into view appends the next page.
 */
export function useRunsFeed(savedRunStore: SavedRunStore): RunsFeed {
  const [runs, setRuns] = useState<GenerationRun[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Synchronous guards so two near-simultaneous triggers (the mount load and an
  // immediate intersection callback) can't double-fetch or read a stale cursor.
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const cursorRef = useRef<string | null>(null);

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) {
      return;
    }

    loadingRef.current = true;
    setIsLoading(true);

    try {
      const collected: GenerationRun[] = [];
      let nextCursor = cursorRef.current;

      // Fetch raw pages until we've gathered a full page of Complete Runs or the
      // store is exhausted — so pages thinned by filtered-out incomplete runs
      // still fill toward the visible target.
      do {
        const page = await savedRunStore.listPaginated({ cursor: nextCursor, limit: feedPageSize });

        nextCursor = page.nextCursor;
        collected.push(...page.runs.filter(isCompleteRun));
      } while (collected.length < feedPageSize && nextCursor !== null);

      cursorRef.current = nextCursor;
      hasMoreRef.current = nextCursor !== null;
      setHasMore(nextCursor !== null);

      if (collected.length > 0) {
        setRuns((current) => [...current, ...collected]);
      }
    } catch {
      // Stop paging on failure (e.g. an unauthenticated request) rather than
      // retrying in a loop; the empty state covers the no-runs case.
      hasMoreRef.current = false;
      setHasMore(false);
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [savedRunStore]);

  // Initial page on mount.
  useEffect(() => {
    void loadMore();
  }, [loadMore]);

  // Append-on-scroll. A callback ref (not an effect) wires the observer so it
  // attaches the moment the sentinel mounts — which only happens after the first
  // page replaces the loading skeletons — and tears down when it unmounts.
  const setSentinel = useCallback(
    (node: HTMLDivElement | null) => {
      observerRef.current?.disconnect();
      observerRef.current = null;

      if (!node || typeof IntersectionObserver === "undefined") {
        return;
      }

      const observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void loadMore();
        }
      });

      observer.observe(node);
      observerRef.current = observer;
    },
    [loadMore],
  );

  return { runs, hasMore, isLoading, setSentinel };
}
