import { parseSavedGenerationRun } from "@/services/generation";
import type { GenerationRun } from "@/services/saved-runs";
import type { resolveRunRepository } from "@/services/saved-runs/run-repository";

const defaultPageLimit = 20;
const maxPageLimit = 100;

/**
 * The single seam the runs routes are driven through. Defaulting to
 * {@link resolveRunRepository} keeps the ownership gate and Supabase wiring in
 * one place; tests inject a fake that returns an in-memory repository (or an
 * unauthorized result) so the route contract is exercised without a backend.
 */
export type RunsRouteDependencies = {
  resolveRepository?: typeof resolveRunRepository;
};

export function unauthorizedResponse(): Response {
  return Response.json({ error: "Operator authentication required." }, { status: 401 });
}

export function clampPageLimit(value: string | null): number {
  if (value === null) {
    return defaultPageLimit;
  }

  const limit = Number.parseInt(value, 10);

  if (Number.isNaN(limit) || limit < 1) {
    return defaultPageLimit;
  }

  return Math.min(limit, maxPageLimit);
}

export function safeParseRun(
  value: unknown,
): { run: GenerationRun; success: true } | { success: false } {
  try {
    return { run: parseSavedGenerationRun(value), success: true };
  } catch {
    return { success: false };
  }
}
