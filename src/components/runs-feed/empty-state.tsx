import { ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type RunsFeedEmptyStateProps = {
  /** Parsed Discovery Source X List ids; one link renders per id. */
  discoverySourceListIds: string[];
};

/**
 * Shown when the operator has no Complete Runs, so the feed is never a blank
 * page. Points at the New Manual Run (`+`) action in the header and explains
 * that Quote Reposts also generate automatically every two hours from the
 * Discovery Source, with one link per configured Discovery Source X List.
 *
 * The "every two hours" cadence tracks the Discovery Sweep cron schedule in
 * `vercel.json` — if that schedule changes, this copy changes with it.
 */
export function RunsFeedEmptyState({ discoverySourceListIds }: RunsFeedEmptyStateProps) {
  return (
    <section aria-label="No runs yet" className="grid justify-items-center gap-5 py-16 text-center">
      <p className="text-base text-foreground leading-6">No complete runs yet.</p>

      <p className="max-w-sm text-muted-foreground text-sm leading-6">
        Make your first one with the{" "}
        <span className="inline-flex items-center gap-0.5 align-middle text-foreground">
          <Plus aria-hidden className="size-3.5" strokeWidth={1.75} />
          New Manual Run
        </span>{" "}
        button above — or wait, and Quote Reposts will generate automatically every two hours from
        your Discovery Source.
      </p>

      {discoverySourceListIds.length > 0 ? (
        <nav
          aria-label="Discovery Source lists"
          className="flex flex-wrap justify-center gap-1.5 pt-1">
          {discoverySourceListIds.map((listId) => (
            <Link
              key={listId}
              href={`https://x.com/i/lists/${listId}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open Discovery Source list ${listId} on X`}
              className={cn(
                buttonVariants({ size: "sm", variant: "ghost" }),
                "gap-1.5 text-muted-foreground",
              )}>
              <span className="text-xs">{listId}</span>
              <ExternalLink aria-hidden className="size-3" strokeWidth={1.75} />
            </Link>
          ))}
        </nav>
      ) : null}
    </section>
  );
}
