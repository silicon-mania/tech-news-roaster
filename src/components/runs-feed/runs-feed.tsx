"use client";

import { Plus, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SignalBug } from "@/components/signal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { httpSavedRunStore } from "@/services/saved-runs";
import type { GenerationRun, SavedRunStore } from "@/services/workspace";
import { formatRelativeTime } from "@/utils/relative-time";
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

// The committed LOCKED IN brand mark (the same outlined, white wordmark the X
// Quote Repost poster bugs with — ADR-0029/0030), reused as the masthead wordmark.
const LOCKED_IN_LOGO_SRC = "/assets/quote-tweet/locked-in-logo.svg";

// The Discovery Sweep cadence (tracks the cron in vercel.json, like the empty
// state's copy). The masthead surfaces it and uses it as the freshness threshold:
// when the newest loaded run is older than one sweep, a newer automated run likely
// exists — an honest, derived nudge (the feed itself does not poll).
const AUTO_SWEEP_CADENCE = "2h";
const AUTO_SWEEP_MS = 2 * 60 * 60 * 1000;

/** A derived, honest status line: loaded count, cadence, and freshness of the feed. */
function deriveDeck(runs: GenerationRun[]): { text: string; isStale: boolean } | null {
  if (runs.length === 0) {
    return null;
  }

  // Runs are newest-first, so the head carries the freshest "generated" time.
  const latestSavedAt = runs[0]?.savedAt;
  const isStale =
    latestSavedAt !== undefined && Date.now() - Date.parse(latestSavedAt) > AUTO_SWEEP_MS;
  const count = `${runs.length} ${runs.length === 1 ? "run" : "runs"}`;

  return {
    isStale,
    text: `${count} · auto-sweep ${AUTO_SWEEP_CADENCE} · last generated ${formatRelativeTime(latestSavedAt)}`,
  };
}

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
    updateSelectedGeneratedImage,
    updateNewsCategory,
    updateNewsCategoryCustom,
    updateNewsCategoryColor,
    uploadSelectedRunImage,
    isUploadGenerating,
    deleteSelectedRun,
  } = useSelectedRun({ runs, savedRunStore, setRuns, uploadImageFetcher });
  const isInitialLoading = isLoading && runs.length === 0;
  const isEmpty = !isLoading && runs.length === 0;
  const deck = deriveDeck(runs);

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
          <div className="grid gap-2">
            <header className="flex items-center justify-between gap-3">
              <h1 className="flex items-center gap-2.5">
                <Image
                  src={LOCKED_IN_LOGO_SRC}
                  alt="LOCKED IN"
                  width={164}
                  height={48}
                  unoptimized
                  className="h-7 w-auto sm:h-8"
                />
                <SignalBug />
              </h1>

              <div className="flex items-center gap-1">
                <span className="relative inline-flex">
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
                    <TooltipContent>
                      {deck?.isStale ? "Refresh — newer runs may be available" : "Refresh"}
                    </TooltipContent>
                  </Tooltip>
                  {deck?.isStale ? (
                    <>
                      {/* Honest, derived nudge: the newest loaded run is older than
                          one auto-sweep, so a newer automated run likely exists. */}
                      <span
                        aria-hidden
                        className="pointer-events-none absolute top-1 right-1 size-1.5 rounded-full"
                        style={{ backgroundColor: "var(--signal-green)" }}
                      />
                      <span className="sr-only">Newer runs may be available</span>
                    </>
                  ) : null}
                </span>

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

            {deck ? (
              <p className="text-[11px] text-muted-foreground uppercase tracking-[0.16em]">
                {deck.text}
              </p>
            ) : null}
          </div>

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
        onNewsCategoryChange={updateNewsCategory}
        onNewsCategoryCustomChange={updateNewsCategoryCustom}
        onNewsCategoryColorChange={updateNewsCategoryColor}
        onSelectedDraftChange={updateSelectedDraft}
        onSelectedGeneratedImageChange={updateSelectedGeneratedImage}
        onUploadImage={uploadSelectedRunImage}
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
        // Mirror the borderless Run Card: a leading stripe column + a panel-less
        // body, so the skeleton's footprint matches the real card (no layout
        // shift when data arrives).
        <div key={key} className="mb-5 grid grid-cols-[6px_1fr] gap-x-4 break-inside-avoid">
          <div className="w-1.5 rounded-[2px] bg-muted-foreground/10" />
          <div className="grid gap-3 py-0.5">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="grid gap-1.5">
                <Skeleton className="h-3.5 w-28" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-3.5 w-24" />
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
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-3 w-56" />
          </div>
        </div>
      ))}
    </div>
  );
}
