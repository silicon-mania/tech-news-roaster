"use client";

import { Copy, Lightbulb } from "lucide-react";
import Image from "next/image";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { QuoteTweetDraft } from "@/services/generation";
import { copyTextToClipboard } from "@/utils/copy-text-to-clipboard";

type DraftComparisonProps = {
  drafts: QuoteTweetDraft[];
  fallbackDisclosure?: string;
  onDraftTextChange: (draftId: string, text: string) => void;
};

const draftCardClassName = "rounded-lg bg-secondary/55 transition duration-300";

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
          <p className="rounded-md bg-card/60 px-3 py-2 text-muted-foreground text-xs leading-5">
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
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          aria-label={`Copy draft ${index + 1}`}
                          className="text-muted-foreground"
                          onClick={(event) => {
                            event.stopPropagation();
                            void copyDraftText(draft.text);
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        />
                      }>
                      <Copy aria-hidden className="size-3.5" strokeWidth={1.75} />
                    </TooltipTrigger>
                    <TooltipContent>Copy draft</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger
                      render={
                        <Button
                          aria-label={`Show visible rationale for draft ${index + 1}`}
                          className="text-muted-foreground"
                          onClick={(event) => {
                            event.stopPropagation();
                            setVisibleRationaleDraftId((currentDraftId) =>
                              currentDraftId === draft.id ? null : draft.id,
                            );
                          }}
                          size="icon"
                          type="button"
                          variant="ghost"
                        />
                      }>
                      <Lightbulb aria-hidden className="size-3.5" strokeWidth={1.75} />
                    </TooltipTrigger>
                    <TooltipContent>Visible rationale</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              {editingDraftId === draft.id ? (
                <Textarea
                  aria-label={`Edit draft ${index + 1}`}
                  value={draft.text}
                  onChange={(event) => onDraftTextChange(draft.id, event.target.value)}
                  className="min-h-48 resize-y whitespace-pre-wrap break-words rounded-md border-transparent px-2 pb-3 text-base text-foreground leading-7 focus-visible:border-border focus-visible:ring-ring/20 md:text-base sm:text-lg sm:leading-8 dark:bg-transparent"
                />
              ) : (
                <button
                  type="button"
                  aria-label={`Edit draft ${index + 1}`}
                  onClick={() => setEditingDraftId(draft.id)}
                  className="whitespace-pre-wrap break-words px-2 pb-3 text-left text-base text-foreground leading-7 outline-none transition focus:text-accent-foreground sm:text-lg sm:leading-8">
                  {draft.text}
                </button>
              )}
              {visibleRationaleDraftId === draft.id ? (
                <p className="mx-2 mb-3 rounded-lg bg-background/45 px-3 py-2 text-muted-foreground text-sm leading-6">
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
                className="grid w-full gap-3 rounded-lg p-3 text-left transition hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 sm:p-4">
                <p className="line-clamp-3 break-words text-muted-foreground text-sm leading-6">
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
    <p className="flex min-w-0 items-center gap-2 text-muted-foreground/80 text-xs">
      <span className="grid h-6 w-6 shrink-0 place-items-center overflow-hidden rounded-md bg-card">
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
  if (await copyTextToClipboard(text)) {
    toast.success("Draft copied");
    return;
  }

  toast.error("Couldn't copy to clipboard");
}
