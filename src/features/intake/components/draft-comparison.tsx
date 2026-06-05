"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import type { QuoteTweetDraft } from "@/features/generation/generation-events";

type DraftComparisonProps = {
  drafts: QuoteTweetDraft[];
  onDraftTextChange: (draftId: string, text: string) => void;
};

export function DraftComparison({
  drafts,
  onDraftTextChange,
}: DraftComparisonProps) {
  const [expandedDraftId, setExpandedDraftId] = useState(drafts.at(0)?.id);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedDraftId((currentExpandedDraftId) => {
      if (
        currentExpandedDraftId &&
        drafts.some((draft) => draft.id === currentExpandedDraftId)
      ) {
        return currentExpandedDraftId;
      }

      return drafts.at(0)?.id;
    });
    setEditingDraftId((currentEditingDraftId) => {
      if (
        currentEditingDraftId &&
        drafts.some((draft) => draft.id === currentEditingDraftId)
      ) {
        return currentEditingDraftId;
      }

      return null;
    });
  }, [drafts]);

  return (
    <section aria-label="Completed draft stack">
      <div className="grid gap-3">
        {drafts.map((draft, index) => {
          const isExpanded = draft.id === expandedDraftId;
          const provider = getDraftProvider(draft.modelProvenance);

          return isExpanded ? (
            <article
              aria-label={`Expanded draft ${index + 1}`}
              key={draft.id}
              className="group grid gap-5 rounded-sm border border-slate-800/70 bg-slate-950/25 px-1 py-1 sm:px-2"
            >
              <div className="flex items-center justify-between gap-3 px-2 pt-2">
                <ProviderProvenance
                  modelProvenance={draft.modelProvenance}
                  provider={provider}
                />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Copy draft ${index + 1}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void copyDraftText(draft.text);
                    }}
                    className="rounded-sm border border-slate-800 px-2 py-1 text-slate-300 text-xs transition hover:border-sky-400/70 hover:text-slate-100"
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    aria-label={`Show visible rationale for draft ${index + 1}`}
                    onClick={(event) => event.stopPropagation()}
                    className="rounded-sm border border-slate-800 px-2 py-1 text-slate-300 text-xs opacity-0 transition hover:border-sky-400/70 hover:text-slate-100 hover:opacity-100 focus:opacity-100 group-hover:opacity-100"
                  >
                    Rationale
                  </button>
                </div>
              </div>
              {editingDraftId === draft.id ? (
                <textarea
                  aria-label={`Edit draft ${index + 1}`}
                  value={draft.text}
                  onChange={(event) =>
                    onDraftTextChange(draft.id, event.target.value)
                  }
                  className="min-h-48 w-full resize-y whitespace-pre-wrap rounded-sm border border-transparent bg-transparent px-2 pb-3 text-base text-slate-100 leading-7 outline-none transition focus:border-slate-800 focus:ring-2 focus:ring-sky-400/20 sm:text-lg sm:leading-8"
                />
              ) : (
                <button
                  type="button"
                  aria-label={`Edit draft ${index + 1}`}
                  onClick={() => setEditingDraftId(draft.id)}
                  className="whitespace-pre-wrap px-2 pb-3 text-left text-base text-slate-100 leading-7 outline-none transition focus:text-sky-100 sm:text-lg sm:leading-8"
                >
                  {draft.text}
                </button>
              )}
            </article>
          ) : (
            <article
              aria-label={`Collapsed draft ${index + 1}`}
              key={draft.id}
              className="rounded-sm border border-slate-800/70 bg-slate-900/35"
            >
              <button
                type="button"
                aria-label={`Expand draft ${index + 1}`}
                onClick={() => {
                  setExpandedDraftId(draft.id);
                  setEditingDraftId(null);
                }}
                className="grid w-full gap-3 p-3 text-left transition hover:bg-slate-900/70 sm:p-4"
              >
                <p className="line-clamp-3 text-slate-300 text-sm leading-6">
                  {draft.text}
                </p>
                <ProviderProvenance
                  modelProvenance={draft.modelProvenance}
                  provider={provider}
                />
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}

type DraftProvider = {
  iconSrc: string;
  name: "ChatGPT" | "Claude" | "Gemini";
};

function ProviderProvenance({
  modelProvenance,
  provider,
}: {
  modelProvenance: string;
  provider: DraftProvider;
}) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-slate-500 text-xs">
      <Image
        alt={`${provider.name} provider icon`}
        className="h-4 w-4 shrink-0"
        height={16}
        src={provider.iconSrc}
        width={16}
      />
      <span className="truncate">
        {provider.name} - {modelProvenance}
      </span>
    </p>
  );
}

function getDraftProvider(modelProvenance: string): DraftProvider {
  const normalizedProvenance = modelProvenance.toLowerCase();

  if (
    normalizedProvenance.includes("anthropic") ||
    normalizedProvenance.includes("claude")
  ) {
    return {
      iconSrc: "/assets/claude.png",
      name: "Claude",
    };
  }

  if (
    normalizedProvenance.includes("google") ||
    normalizedProvenance.includes("gemini")
  ) {
    return {
      iconSrc: "/assets/gemini.png",
      name: "Gemini",
    };
  }

  return {
    iconSrc: "/assets/chatgpt.png",
    name: "ChatGPT",
  };
}

async function copyDraftText(text: string) {
  await navigator.clipboard?.writeText(text);
}
