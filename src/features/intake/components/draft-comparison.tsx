import type { QuoteTweetDraft } from "@/features/generation/generation-events";

type DraftComparisonProps = {
  drafts: QuoteTweetDraft[];
};

export function DraftComparison({ drafts }: DraftComparisonProps) {
  return (
    <section aria-label="Completed draft comparison">
      <div className="flex items-center justify-between gap-3">
        <p className="font-medium text-slate-300 text-sm">Draft comparison</p>
        <span className="text-slate-500 text-xs">{drafts.length} drafts</span>
      </div>
      <div className="mt-3 grid gap-3 xl:grid-cols-3">
        {drafts.map((draft) => (
          <article
            key={draft.id}
            className="grid content-between gap-4 rounded-md border border-slate-800 bg-slate-900/55 p-4"
          >
            <p className="whitespace-pre-wrap text-slate-100 text-sm leading-6">
              {draft.text}
            </p>
            <p className="border-slate-800 border-t pt-3 text-slate-400 text-xs">
              Model Provenance: {draft.modelProvenance}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
