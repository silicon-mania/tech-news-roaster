"use client";

import { Plus } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { httpSavedRunStore } from "@/services/saved-runs";
import type { SavedRunStore } from "@/services/workspace";
import { RunCard } from "./run-card";
import { useRunsFeed } from "./use-runs-feed";

type RunsFeedProps = {
  savedRunStore?: SavedRunStore;
};

const LOGO_SRC = "/assets/logo/logo.png";

/**
 * The Runs Feed — the product's landing page. Lists the operator's Complete Runs
 * newest-first as an infinite-scrolling column of Run Cards, with the New Manual
 * Run action opening the (relocated) generation Workspace. The default store
 * reaches Supabase only through the server routes; tests inject an in-memory one.
 */
export function RunsFeed({ savedRunStore = httpSavedRunStore }: RunsFeedProps) {
  const { runs, hasMore, isLoading, setSentinel } = useRunsFeed(savedRunStore);
  const isInitialLoading = isLoading && runs.length === 0;
  const isEmpty = !isLoading && runs.length === 0;

  return (
    <main className="min-h-screen px-3 py-6 text-foreground sm:px-8 sm:py-10">
      <div className="mx-auto grid w-full max-w-xl gap-6">
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
        </header>

        {isInitialLoading ? (
          <FeedSkeletons />
        ) : isEmpty ? (
          <p className="py-16 text-center text-muted-foreground text-sm leading-6">
            No complete runs yet.
          </p>
        ) : (
          <section aria-label="Runs" className="grid gap-4">
            {runs.map((run) => (
              <RunCard key={run.id} run={run} />
            ))}

            {hasMore ? <div ref={setSentinel} aria-hidden className="h-px" /> : null}
          </section>
        )}
      </div>
    </main>
  );
}

const skeletonCardKeys = ["first", "second", "third"];

function FeedSkeletons() {
  return (
    <div aria-hidden className="grid gap-4">
      {skeletonCardKeys.map((key) => (
        <div key={key} className="grid gap-2 rounded-xl bg-card px-5 py-4">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ))}
    </div>
  );
}
