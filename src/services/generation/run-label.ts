/**
 * The fallback run label both composition wrappers (Manual and Automated) apply.
 * It is origin-agnostic on purpose: the run's `origin` field already records who
 * composed it, so a single shared label avoids two near-identical builders. This
 * label only surfaces when Text Generation produced no label of its own (the
 * Generation Orchestrator's "Drafts for …" label takes precedence on success), so
 * in practice it titles failed and text-failed runs in the unified list.
 */
export function buildRunLabel(sourceTweetUrl: string): string {
  const statusId = sourceTweetUrl.match(/status\/([^/?#]+)/)?.[1] ?? "tweet";

  return `Run for ${statusId}`;
}
