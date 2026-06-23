"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Owns whether the Final Quote Tweet Image overlay is expanded, per run and in
 * memory (a reload resets to the default). The rules:
 *
 *  - A run defaults to expanded the first time its overlay is shown, so the
 *    guidance — or the finished composite — is visible without a click.
 *  - Any change to that run's Selected Generated Image force-expands it, so
 *    picking the image that completes the composite reopens a collapsed overlay.
 *  - The user can collapse at any time; a collapse only sticks until the next
 *    selection change.
 *  - Switching runs is not a selection change — each run keeps its own state.
 */
export function useQuoteTweetOverlayState({
  runId,
  selectedImageOptionId,
}: {
  runId: string | null;
  selectedImageOptionId: string | null;
}) {
  const [expandedByRunId, setExpandedByRunId] = useState<Record<string, boolean>>({});
  const lastSelectionRef = useRef<{
    runId: string | null;
    imageOptionId: string | null;
  } | null>(null);

  useEffect(() => {
    const previous = lastSelectionRef.current;

    lastSelectionRef.current = {
      imageOptionId: selectedImageOptionId,
      runId,
    };

    if (!runId || !previous || previous.runId !== runId) {
      // First render for this run, or a run switch: not a selection change.
      return;
    }

    if (previous.imageOptionId !== selectedImageOptionId) {
      setExpandedByRunId((current) => ({ ...current, [runId]: true }));
    }
  }, [runId, selectedImageOptionId]);

  const isExpanded = runId ? (expandedByRunId[runId] ?? true) : true;

  const expand = useCallback(() => {
    if (runId) {
      setExpandedByRunId((current) => ({ ...current, [runId]: true }));
    }
  }, [runId]);

  const collapse = useCallback(() => {
    if (runId) {
      setExpandedByRunId((current) => ({ ...current, [runId]: false }));
    }
  }, [runId]);

  return { collapse, expand, isExpanded };
}
