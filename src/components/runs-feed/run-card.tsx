import type { GenerationRun } from "@/services/workspace";

type RunCardProps = {
  run: GenerationRun;
};

/**
 * Minimal placeholder Run Card. It resolves the run's Selected Draft (the
 * operator's explicit pick, or the first draft as a display-only fallback) and
 * shows it under the run label. The faithful Quote Repost preview — Operator
 * Account header, Final Quote Tweet Image, embedded Source Tweet, engagement
 * chrome, and timestamps — lands in the next slice (issue 004); this stands up
 * the feed plumbing without it.
 */
export function RunCard({ run }: RunCardProps) {
  const selectedDraft =
    run.drafts.find((draft) => draft.id === run.selectedDraftId) ?? run.drafts.at(0);

  return (
    <article className="grid gap-2 rounded-xl bg-card px-5 py-4">
      <h2 className="font-medium text-foreground text-sm leading-5">{run.label}</h2>
      {selectedDraft ? (
        <p className="text-muted-foreground text-sm leading-6">{selectedDraft.text}</p>
      ) : null}
    </article>
  );
}
