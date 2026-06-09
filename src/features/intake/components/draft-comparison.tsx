"use client";

import { Copy, Lightbulb } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import type { QuoteTweetDraft } from "@/features/generation/generation-events";

type DraftComparisonProps = {
  drafts: QuoteTweetDraft[];
  fallbackDisclosure?: string;
  onDraftTextChange: (draftId: string, text: string) => void;
};

const draftCardClassName =
  "rounded-lg border border-slate-600/20 bg-slate-900/55 transition duration-300";

export function DraftComparison({
  drafts,
  fallbackDisclosure,
  onDraftTextChange,
}: DraftComparisonProps) {
  const [expandedDraftId, setExpandedDraftId] = useState(drafts.at(0)?.id);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);
  const [visibleRationaleDraftId, setVisibleRationaleDraftId] = useState<string | null>(null);

  useEffect(() => {
    setExpandedDraftId((currentExpandedDraftId) => {
      if (currentExpandedDraftId && drafts.some((draft) => draft.id === currentExpandedDraftId)) {
        return currentExpandedDraftId;
      }

      return drafts.at(0)?.id;
    });
    setEditingDraftId((currentEditingDraftId) => {
      if (currentEditingDraftId && drafts.some((draft) => draft.id === currentEditingDraftId)) {
        return currentEditingDraftId;
      }

      return null;
    });
    setVisibleRationaleDraftId((currentVisibleRationaleDraftId) => {
      if (
        currentVisibleRationaleDraftId &&
        drafts.some((draft) => draft.id === currentVisibleRationaleDraftId)
      ) {
        return currentVisibleRationaleDraftId;
      }

      return null;
    });
  }, [drafts]);

  return (
    <section aria-label="Completed draft stack">
      <div className="grid gap-3">
        {fallbackDisclosure ? (
          <p className="rounded-sm border border-slate-800/70 bg-slate-950/45 px-3 py-2 text-slate-500 text-xs leading-5">
            {fallbackDisclosure}
          </p>
        ) : null}
        {drafts.map((draft, index) => {
          const isExpanded = draft.id === expandedDraftId;
          const hasExpandedDraft = expandedDraftId != null;
          const provider = getDraftProvider(draft.provider, draft.modelProvenance);

          return isExpanded ? (
            <article
              aria-label={`Expanded draft ${index + 1}`}
              key={draft.id}
              className={`grid gap-5 px-1 py-1 sm:px-2 ${draftCardClassName}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-2 pt-2">
                <ProviderProvenance modelProvenance={draft.modelProvenance} provider={provider} />
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Copy draft ${index + 1}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      void copyDraftText(draft.text);
                    }}
                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
                    <Copy aria-hidden className="size-3.5" strokeWidth={1.75} />
                  </button>
                  <button
                    type="button"
                    aria-label={`Show visible rationale for draft ${index + 1}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setVisibleRationaleDraftId((currentDraftId) =>
                        currentDraftId === draft.id ? null : draft.id,
                      );
                    }}
                    className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-800/60 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-300/20">
                    <Lightbulb aria-hidden className="size-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              </div>
              {editingDraftId === draft.id ? (
                <textarea
                  aria-label={`Edit draft ${index + 1}`}
                  value={draft.text}
                  onChange={(event) => onDraftTextChange(draft.id, event.target.value)}
                  className="min-h-48 w-full resize-y whitespace-pre-wrap break-words rounded-sm border border-transparent bg-transparent px-2 pb-3 text-base text-slate-100 leading-7 outline-none transition focus:border-slate-800 focus:ring-2 focus:ring-sky-300/20 sm:text-lg sm:leading-8"
                />
              ) : (
                <button
                  type="button"
                  aria-label={`Edit draft ${index + 1}`}
                  onClick={() => setEditingDraftId(draft.id)}
                  className="whitespace-pre-wrap break-words px-2 pb-3 text-left text-base text-slate-100 leading-7 outline-none transition focus:text-sky-100 sm:text-lg sm:leading-8">
                  {draft.text}
                </button>
              )}
              {visibleRationaleDraftId === draft.id ? (
                <p className="mx-2 mb-3 rounded-lg border border-slate-600/20 bg-slate-950/35 px-3 py-2 text-slate-400 text-sm leading-6">
                  {draft.visibleRationale}
                </p>
              ) : null}
            </article>
          ) : (
            <article
              aria-label={`Collapsed draft ${index + 1}`}
              key={draft.id}
              className={`${draftCardClassName}${hasExpandedDraft ? " opacity-60" : ""}`}>
              <button
                type="button"
                aria-label={`Expand draft ${index + 1}`}
                onClick={() => {
                  setExpandedDraftId(draft.id);
                  setEditingDraftId(null);
                  setVisibleRationaleDraftId(null);
                }}
                className="grid w-full gap-3 rounded-lg p-3 text-left transition hover:bg-slate-800/25 focus:outline-none focus:ring-2 focus:ring-sky-300/20 sm:p-4">
                <p className="line-clamp-3 break-words text-slate-300 text-sm leading-6">
                  {draft.text}
                </p>
                <ProviderProvenance modelProvenance={draft.modelProvenance} provider={provider} />
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
    <p className="flex min-w-0 items-center gap-2 text-white/50 text-xs">
      <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md border border-slate-800/90 bg-slate-950/70">
        <Image
          alt={`${provider.name} provider icon`}
          className="h-full w-full"
          height={72}
          src={provider.iconSrc}
          width={72}
        />
      </span>
      <span className="truncate">{modelProvenance}</span>
    </p>
  );
}

function getDraftProvider(
  providerId: QuoteTweetDraft["provider"] | undefined,
  modelProvenance: string,
): DraftProvider {
  if (providerId === "anthropic") {
    return {
      iconSrc: "/assets/claude.png",
      name: "Claude",
    };
  }

  if (providerId === "google") {
    return {
      iconSrc: "/assets/gemini.png",
      name: "Gemini",
    };
  }

  if (providerId === "openai") {
    return {
      iconSrc: "/assets/chatgpt.png",
      name: "ChatGPT",
    };
  }

  const normalizedProvenance = modelProvenance.toLowerCase();

  if (normalizedProvenance.includes("anthropic") || normalizedProvenance.includes("claude")) {
    return {
      iconSrc: "/assets/claude.png",
      name: "Claude",
    };
  }

  if (normalizedProvenance.includes("google") || normalizedProvenance.includes("gemini")) {
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
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    // Clipboard permissions can be denied in automated or locked-down browsers.
  }
}
