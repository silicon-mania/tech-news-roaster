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
  /**
   * The loaded-runs setter, so the Selected Run sidebar can update a run in place
   * — the card reads the same list, so an edit reflects on it instantly.
   */
  setRuns: Dispatch<SetStateAction<GenerationRun[]>>;
  /** Whether more pages remain to load. */
  hasMore: boolean;
  /** True while a page is being fetched (initial load or scroll). */
  isLoading: boolean;
  /** True while a manual Refresh is re-fetching the first page. */
  isRefreshing: boolean;
  /**
   * Re-fetch the first page and merge any newly-arrived Complete Runs to the top
   * of the feed, then toast how many arrived. Pulls in runs that finished after
   * the page loaded — finished Manual Runs and background Automated Runs.
   */
  refresh: () => void;
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
  const [isRefreshing, setIsRefreshing] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  // Synchronous guards so two near-simultaneous triggers (the mount load and an
  // immediate intersection callback) can't double-fetch or read a stale cursor.
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(true);
  const cursorRef = useRef<string | null>(null);
  // A dedicated guard for Refresh (not the paging loadingRef) so it stays
  // available while a scroll-load is in flight; rapid clicks collapse to one.
  const refreshingRef = useRef(false);
  // Latest loaded runs, read inside the async refresh so it can dedupe new
  // arrivals and count them accurately without widening the callback's deps.
  const runsRef = useRef<GenerationRun[]>([]);
  runsRef.current = runs;

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
        // Dedupe on append: a Refresh may have already prepended a first-page run
        // that the initial load also collected, so guard against a double entry.
        setRuns((current) => {
          const existingIds = new Set(current.map((run) => run.id));
          const fresh = collected.filter((run) => !existingIds.has(run.id));

          return fresh.length > 0 ? [...current, ...fresh] : current;
        });
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

  const refresh = useCallback(async () => {
    if (refreshingRef.current) {
      return;
    }

    refreshingRef.current = true;
    setIsRefreshing(true);

    try {
      // Re-run just the first page (the newest runs). A finished Manual Run or a
      // background Automated Run lands here with a fresh savedAt, ahead of
      // everything already loaded — no pending counter, no local-storage tracking.
      const page = await savedRunStore.listPaginated({ cursor: null, limit: feedPageSize });
      const existingIds = new Set(runsRef.current.map((run) => run.id));
      const newRuns = page.runs.filter((run) => isCompleteRun(run) && !existingIds.has(run.id));

      if (newRuns.length > 0) {
        // Prepend newest-first (the page is already saved_at DESC), re-deduping
        // against the live list in case a scroll-load appended in the meantime.
        setRuns((current) => {
          const present = new Set(current.map((run) => run.id));
          const stillNew = newRuns.filter((run) => !present.has(run.id));

          return stillNew.length > 0 ? [...stillNew, ...current] : current;
        });
      }

      toast.success(refreshToastMessage(newRuns.length));
    } catch {
      toast.error("Couldn't refresh the feed");
    } finally {
      refreshingRef.current = false;
      setIsRefreshing(false);
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

  return { runs, setRuns, hasMore, isLoading, isRefreshing, refresh, setSentinel };
}

// Quiet, count-reporting confirmation for a Refresh — singular/plural aware, and
// explicit when nothing arrived so the action never feels like a no-op.
function refreshToastMessage(newRunCount: number): string {
  if (newRunCount === 0) {
    return "No new runs";
  }

  return newRunCount === 1 ? "1 new run" : `${newRunCount} new runs`;
}
