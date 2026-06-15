import { parseSavedGenerationRun } from "@/services/generation";
import type { GenerationRun } from "./types";

/**
 * Validates a run and guarantees it carries an `origin` before it is stored, so
 * every persisted run is provenance-tagged — manual (and pre-existing) runs
 * default to "manual"; automated discovery runs set it explicitly.
 */
export function normalizeRunForPersistence(run: GenerationRun): GenerationRun {
  return parseSavedGenerationRun({ ...run, origin: run.origin ?? "manual" });
}

export function compareNewestSavedRunFirst(left: GenerationRun, right: GenerationRun): number {
  const leftSavedAt = getSavedRunTimestamp(left);
  const rightSavedAt = getSavedRunTimestamp(right);

  if (leftSavedAt !== rightSavedAt) {
    return rightSavedAt - leftSavedAt;
  }

  return right.id.localeCompare(left.id);
}

function getSavedRunTimestamp(run: GenerationRun): number {
  const savedAt = Date.parse(run.savedAt ?? "");

  return Number.isNaN(savedAt) ? 0 : savedAt;
}

/**
 * Pagination uses a plain numeric offset encoded as the cursor. The runs list is
 * single-operator and low-volume, so keyset cursors would be over-engineering;
 * an offset is enough to page without the dropped ten-run retention cap.
 */
export function parsePageOffset(cursor: string | null | undefined): number {
  if (!cursor) {
    return 0;
  }

  const offset = Number.parseInt(cursor, 10);

  return Number.isNaN(offset) || offset < 0 ? 0 : offset;
}

export function nextPageCursor(offset: number, limit: number, total: number): string | null {
  const nextOffset = offset + limit;

  return nextOffset < total ? String(nextOffset) : null;
}
