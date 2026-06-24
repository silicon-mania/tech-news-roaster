"use client";

import { ArrowUpRight, Trash2, X } from "lucide-react";
import Image from "next/image";
import { useEffect } from "react";
import { ImageSetStack, UploadImageButton } from "@/components/image-sets";
import { Button } from "@/components/ui/button";
import { DraftComparison } from "@/components/workspace/draft-comparison";
import { NewsCategorySection } from "@/components/workspace/news-category-section";
import type { RetrievedSourceTweet } from "@/services/tweet-retrieval";
import type { GenerationRun } from "@/services/workspace";
import { FinalImageDownload } from "./final-image-download";

type SelectedRunSidebarProps = {
  /** The open run, or null when the sidebar is closed. */
  run: GenerationRun | null;
  onClose: () => void;
  onSelectedDraftChange: (draftId: string | null) => void;
  onDraftTextChange: (draftId: string, text: string) => void;
  onSelectedGeneratedImageChange: (imageOptionId: string | null) => void;
  /** Pick the run's News Category stamp — saves immediately, re-stamps the preview. */
  onNewsCategoryChange: (newsCategory: string) => void;
  /** Edit the run's custom News Category word — saves debounced, re-stamps the preview. */
  onNewsCategoryCustomChange: (newsCategory: string) => void;
  /** Upload an image of the operator's own to generate a new Uploaded Image Set. */
  onUploadImage: (file: File) => void;
  /** Whether an upload generation is in flight (disables the trigger, shows skeleton). */
  isUploadGenerating: boolean;
  onDelete: () => void;
};

/**
 * The Selected Run sidebar — the in-place editor that opens over the Runs Feed
 * when a card is clicked. It docks on the right and slides in (mirroring the
 * workspace direction panel) without dimming the feed, so the selected card stays
 * visible as the live preview and every edit reflects on it instantly.
 *
 * It renders the shell plus, top-to-bottom: a News Category section — the shared
 * {@link NewsCategorySection} chips that stamp the Final Quote Tweet Image's
 * headline, sitting directly above it; a Final image section — a preview of
 * the run's Final Quote Tweet Image with a Download action that saves it as the
 * same lossless PNG the workspace offers ({@link FinalImageDownload}); a compact
 * Source post reference that opens the original tweet on X in a new tab; a Text
 * section — the run's drafts,
 * switchable and inline-editable — built from the same {@link DraftComparison} the
 * workspace uses; and an Image section — the run's stack of
 * Image Sets with the four generated variations of each switchable, plus an
 * "Upload your own image" trigger that generates a new Uploaded Image Set — built
 * from the same {@link ImageSetStack} the workspace uses, so switching a variation
 * re-derives the card's Final Quote Tweet Image. The panel scrolls. At the bottom sits the
 * delete region — the run's only delete affordance (kept off the Run Card so it
 * can't be triggered by accident) — which removes the run and quietly toasts.
 */
export function SelectedRunSidebar({
  run,
  onClose,
  onSelectedDraftChange,
  onDraftTextChange,
  onSelectedGeneratedImageChange,
  onNewsCategoryChange,
  onNewsCategoryCustomChange,
  onUploadImage,
  isUploadGenerating,
  onDelete,
}: SelectedRunSidebarProps) {
  const isOpen = run !== null;

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <aside
      aria-label="Selected run"
      className={`fixed inset-y-0 right-0 z-50 flex w-[min(28rem,calc(100vw-2rem))] flex-col gap-6 overflow-y-auto bg-popover/95 px-5 py-6 shadow-2xl shadow-black/40 backdrop-blur transition-transform duration-300 ease-out sm:px-6 ${
        isOpen ? "translate-x-0" : "translate-x-full"
      }`}
      inert={!isOpen}>
      {run ? (
        <>
          <header className="flex items-center justify-between gap-2">
            <h2 className="title-serif text-foreground text-xl md:text-2xl">Selected run</h2>
            <Button
              aria-label="Close selected run"
              className="shrink-0 text-muted-foreground"
              onClick={onClose}
              size="icon"
              type="button"
              variant="ghost">
              <X aria-hidden className="size-4" strokeWidth={1.75} />
            </Button>
          </header>

          {/* The News Category section sits next to the artifact it stamps —
              directly above the Final Quote Tweet Image (ADR-0027). Its heading
              matches the sidebar's other sections (compact h3). */}
          <section aria-label="News category" className="grid min-w-0 gap-3">
            <h3 className="title-serif text-foreground text-lg">News category</h3>
            <NewsCategorySection
              newsCategory={run.newsCategory}
              onNewsCategoryChange={onNewsCategoryChange}
              onNewsCategoryCustomChange={onNewsCategoryCustomChange}
            />
          </section>

          <FinalImageDownload run={run} />

          {run.sourceTweet ? <SourcePostReference sourceTweet={run.sourceTweet} /> : null}

          <section aria-label="Text" className="grid min-w-0 gap-3">
            <h3 className="title-serif text-foreground text-lg">Text</h3>
            <DraftComparison
              drafts={run.drafts}
              selectedDraftId={run.selectedDraftId ?? null}
              onDraftTextChange={onDraftTextChange}
              onSelectedDraftChange={onSelectedDraftChange}
            />
          </section>

          {/* The Image section always shows so the upload trigger is reachable on
              any run. The stack uses the same Image Set article the workspace does,
              so only the four generated variations of each set are selectable — the
              Selected Image Original stays display-only, and there is no
              regeneration or prompt control here, keeping the sidebar a quick
              editor. Uploading appends a new "Image set N" below the others. */}
          <section aria-label="Image" className="grid min-w-0 gap-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="title-serif text-foreground text-lg">Image</h3>
              <UploadImageButton disabled={isUploadGenerating} onUpload={onUploadImage} />
            </div>
            <ImageSetStack
              isGenerationPending={isUploadGenerating}
              onSelectedGeneratedImageChange={onSelectedGeneratedImageChange}
              run={run}
              selectedGeneratedImageOptionId={run.selectedGeneratedImage?.imageOptionId ?? null}
            />
          </section>

          {/* The delete region sits last, below the editing controls, so removing
              a run is a deliberate scroll-to-the-bottom action — there's no
              blocking confirm dialog, just a quiet toast (PRD). */}
          <section aria-label="Delete run" className="mt-auto flex pt-2">
            <Button className="gap-2" onClick={onDelete} type="button" variant="destructive">
              <Trash2 aria-hidden className="size-4" strokeWidth={1.75} />
              Delete run
            </Button>
          </section>
        </>
      ) : null}
    </aside>
  );
}

/**
 * A compact reference to the original Source Tweet that links out to it on X in a
 * new browser tab, so the operator keeps the source context while editing without
 * losing their place in the feed.
 */
function SourcePostReference({ sourceTweet }: { sourceTweet: RetrievedSourceTweet }) {
  return (
    <a
      aria-label="Open the source post on X in a new tab"
      className="group flex items-start gap-3 rounded-lg bg-card px-3.5 py-3 transition-colors hover:bg-muted/40"
      href={sourceTweet.url}
      rel="noopener noreferrer"
      target="_blank">
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-background p-1.5">
        <Image
          alt=""
          aria-hidden
          className="size-full object-contain"
          height={28}
          src="/assets/x-light.png"
          width={28}
        />
      </span>
      <span className="grid min-w-0 gap-1">
        <span className="flex items-center gap-1 text-muted-foreground text-xs">
          Source post
          <ArrowUpRight
            aria-hidden
            className="size-3.5 transition-transform group-hover:-translate-y-px group-hover:translate-x-px"
            strokeWidth={1.75}
          />
        </span>
        <span className="line-clamp-2 wrap-break-word text-foreground/90 text-sm leading-6">
          {sourceTweet.text}
        </span>
      </span>
    </a>
  );
}
