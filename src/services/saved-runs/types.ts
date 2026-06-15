import type { SavedGenerationRun } from "@/services/generation";

export type GenerationRun = SavedGenerationRun;

type ListRunsPageOptions = {
  cursor?: string | null;
  limit: number;
};

type RunsPage = {
  nextCursor: string | null;
  runs: GenerationRun[];
};

/**
 * The Saved Run contract. Beyond the original list / save / delete it now also
 * loads a single run by id, lists runs one page at a time, and marks a run seen
 * — the surface the unified runs page (issue 013) and discovery sweeps build on.
 */
export type SavedRunStore = {
  list(): Promise<GenerationRun[]>;
  listPaginated(options: ListRunsPageOptions): Promise<RunsPage>;
  loadById(runId: string): Promise<GenerationRun | null>;
  save(run: GenerationRun): Promise<void>;
  delete(runId: string): Promise<void>;
  markSeen(runId: string): Promise<void>;
};

/**
 * The server-side, owner-scoped persistence the routes reach. Same shape as the
 * client store, but every instance is bound to one Operator Account so ownership
 * is enforced by construction — a repository never sees another operator's runs.
 */
export type RunRepository = SavedRunStore;
