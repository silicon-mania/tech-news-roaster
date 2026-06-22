"use client";

import { Plus, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { httpSavedRunStore } from "@/services/saved-runs";
import type { SavedRunStore } from "@/services/workspace";
import { RunsFeedEmptyState } from "./empty-state";
import { RunCard } from "./run-card";
import { SelectedRunSidebar } from "./selected-run-sidebar";
import { useRunsFeed } from "./use-runs-feed";
import { useSelectedRun } from "./use-selected-run";

type RunsFeedProps = {
  savedRunStore?: SavedRunStore;
  /**
   * Discovery Source X List ids, parsed server-side by the `/` route from
   * `DISCOVERY_SOURCE_LIST_IDS` and passed in so the raw env var never reaches
   * the client bundle. The empty state renders one link per id.
   */
  discoverySourceListIds?: string[];
  /** Injected for tests; defaults to the global `fetch` for the upload stream. */
  uploadImageFetcher?: typeof fetch;
};

const LOGO_SRC = "/assets/logo/logo.png";

/**
 * The Runs Feed — the product's landing page. Lists the operator's Complete Runs
 * newest-first as an infinite-scrolling masonry of Run Cards (one column on
 * narrow viewports, two when there's room), with the New Manual Run action
 * opening the (relocated) generation Workspace. The default store reaches Supabase
 * only through the server routes; tests inject an in-memory one.
 */
export function RunsFeed({
  savedRunStore = httpSavedRunStore,
  discoverySourceListIds = [],
  uploadImageFetcher,
}: RunsFeedProps) {
  const { runs, setRuns, hasMore, isLoading, isRefreshing, refresh, setSentinel } =
    useRunsFeed(savedRunStore);
  const {
    selectedRun,
    selectRun,
    closeSelectedRun,
    updateSelectedDraft,
    updateDraftText,
    updateSelectedVisualJoke,
    updateVisualJokeTitle,
    updateSelectedGeneratedImage,
    uploadSelectedRunImage,
    isUploadGenerating,
    deleteSelectedRun,
  } = useSelectedRun({ runs, savedRunStore, setRuns, uploadImageFetcher });
  const isInitialLoading = isLoading && runs.length === 0;
  const isEmpty = !isLoading && runs.length === 0;

  return (
    <>
      <main
        className={cn(
          "min-h-screen px-3 py-6 text-foreground transition-[padding] duration-300 ease-out sm:px-8 sm:py-10",
          // Shift the feed left of the docked sidebar so the selected card stays
          // visible beside it while the operator edits.
          selectedRun ? "lg:pr-[28rem]" : "",
        )}>
        <div className="mx-auto grid w-full max-w-md gap-6 lg:max-w-2xl">
          <header className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Image
                src={LOGO_SRC}
                alt=""
                aria-hidden
                width={32}
                height={32}
                className="size-7 rounded-lg sm:size-8"
              />
              <h1 className="title-serif text-2xl text-foreground sm:text-3xl">Auto-news</h1>
            </div>

            <div className="flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Refresh"
                      onClick={refresh}
                      disabled={isRefreshing}
                      className="text-muted-foreground"
                    />
                  }>
                  <RefreshCw
                    aria-hidden
                    className={cn("size-4", isRefreshing && "animate-spin")}
                    strokeWidth={1.75}
                  />
                </TooltipTrigger>
                <TooltipContent>Refresh</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      href="/workspace"
                      aria-label="New Manual Run"
                      className={cn(
                        buttonVariants({ size: "icon", variant: "ghost" }),
                        "text-muted-foreground",
                      )}
                    />
                  }>
                  <Plus aria-hidden className="size-4" strokeWidth={1.75} />
                </TooltipTrigger>
                <TooltipContent>New Manual Run</TooltipContent>
              </Tooltip>
            </div>
          </header>

          {isInitialLoading ? (
            <FeedSkeletons />
          ) : isEmpty ? (
            <RunsFeedEmptyState discoverySourceListIds={discoverySourceListIds} />
          ) : (
            <section aria-label="Runs">
              {/* A masonry of tiles, not a grid: cards keep their natural height
                  and pack column-by-column, so a short card never leaves a gap
                  under a tall one. CSS multi-column preserves DOM order (newest
                  first), so it flows top-of-column-1 downward, then column 2. */}
              <div className="columns-1 gap-5 lg:columns-2">
                {runs.map((run) => (
                  <div key={run.id} className="mb-5 break-inside-avoid">
                    <RunCard run={run} onSelect={selectRun} />
                  </div>
                ))}
              </div>

              {/* Kept outside the columns so it sits below the whole masonry —
                  the bottom of the tallest column — and trips append-on-scroll. */}
              {hasMore ? <div ref={setSentinel} aria-hidden className="h-px" /> : null}
            </section>
          )}
        </div>
      </main>

      <SelectedRunSidebar
        isUploadGenerating={isUploadGenerating}
        onClose={closeSelectedRun}
        onDelete={deleteSelectedRun}
        onDraftTextChange={updateDraftText}
        onSelectedDraftChange={updateSelectedDraft}
        onSelectedGeneratedImageChange={updateSelectedGeneratedImage}
        onSelectedVisualJokeChange={updateSelectedVisualJoke}
        onUploadImage={uploadSelectedRunImage}
        onVisualJokeTitleChange={updateVisualJokeTitle}
        run={selectedRun}
      />
    </>
  );
}

// Caption-line widths vary per skeleton so the placeholder tiles stagger like the
// real masonry (cards differ in commentary length) rather than aligning into a
// rigid grid while loading.
const skeletonCards = [
  { captionWidths: ["w-full", "w-4/5"], key: "first" },
  { captionWidths: ["w-full", "w-full", "w-2/3"], key: "second" },
  { captionWidths: ["w-3/4"], key: "third" },
  { captionWidths: ["w-full", "w-5/6"], key: "fourth" },
];

function FeedSkeletons() {
  return (
    <div aria-hidden className="columns-1 gap-5 lg:columns-2">
      {skeletonCards.map(({ captionWidths, key }) => (
        <div key={key} className="mb-5 grid gap-2 break-inside-avoid">
          <div className="grid gap-3 rounded-xl bg-card px-5 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="grid gap-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            {captionWidths.map((width, lineIndex) => (
              <Skeleton
                className={cn("h-4", width)}
                // biome-ignore lint/suspicious/noArrayIndexKey: caption lines are positional placeholders with no identity
                key={`${key}-caption-${lineIndex}`}
              />
            ))}
            {/* Matches the portrait Final Quote Tweet Image frame so media load
                causes no layout shift. */}
            <Skeleton className="aspect-[3240/4050] w-full rounded-xl" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
          <Skeleton className="h-3 w-56" />
        </div>
      ))}
    </div>
  );
}
