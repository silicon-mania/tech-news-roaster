import { BadgeCheck } from "lucide-react";
import Image from "next/image";
import { SignalStripe } from "@/components/signal";
import { QuoteTweetComposite } from "@/components/workspace/quote-tweet-composite";
import { resolveBandColor, resolveNewsCategoryStamp } from "@/services/generation";
import type { RetrievedSourceTweet } from "@/services/tweet-retrieval";
import type { GenerationRun } from "@/services/workspace";
import { formatRelativeTime } from "@/utils/relative-time";
import { resolveRunCardContent } from "./resolve-run-card-content";

type RunCardProps = {
  run: GenerationRun;
  /**
   * Opens the run's Selected Run sidebar. When omitted the card is a static
   * preview (e.g. rendered in isolation); the feed always passes it so the whole
   * card becomes one click target.
   */
  onSelect?: (runId: string) => void;
};

// The fixed Operator Account every Run Card posts as (PRD "Brand identity"). The
// source author appears only inside the embedded quoted tweet, never here.
const operatorAccount = {
  avatarSrc: "/assets/logo/avatar-placeholder.jpg",
  displayName: "Silicon Mania",
  handle: "siliconmania",
};

/**
 * A faithful preview of the Quote Repost a Complete Run becomes, composed as an X
 * quote-repost post in the LOCKED IN "Signal Desk" language (ADR-0030): the fixed
 * Operator Account header, the run's News Category as a condensed-italic signal
 * word, the resolved Selected Draft as commentary, the reused Final Quote Tweet
 * Image composite as media, and the Source Tweet as a left-rule pull-quote — with
 * "generated X ago" and "original tweet posted Y ago" beneath.
 *
 * The card is borderless: a single angular {@link SignalStripe} on the left flies
 * the run's News Category Color (the same hex the composite bands with), lifting
 * to full saturation on hover/focus as the click affordance. Content slots resolve
 * the operator's explicit choice or fall back to first-of-each
 * ({@link resolveRunCardContent}); the fallback is display-only and persists
 * nothing. The run label is the card's accessible name, not painted, so the
 * preview reads like a genuine post rather than an internal list row.
 */
export function RunCard({ run, onSelect }: RunCardProps) {
  const { draft, sourceTweet, variation } = resolveRunCardContent(run);
  // One color, two surfaces: the stripe and the composite band share this hex.
  const bandColor = resolveBandColor(run.newsCategory, run.newsCategoryColor);
  const stamp = resolveNewsCategoryStamp(run.newsCategory);

  return (
    <article aria-label={run.label} className="group relative grid grid-cols-[6px_1fr] gap-x-4">
      {onSelect ? (
        // A full-card overlay button — the card's content is non-interactive
        // (the embedded Source Tweet is static), so the whole preview is a single
        // click target that opens the sidebar. Hover/focus lifts the signal stripe.
        <button
          aria-label={`Open ${run.label}`}
          className="absolute inset-0 z-10 rounded-lg transition-colors hover:bg-foreground/[0.02] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          onClick={() => onSelect(run.id)}
          type="button"
        />
      ) : null}

      <SignalStripe color={bandColor} />

      <div className="grid gap-3 py-0.5">
        <header className="flex items-center gap-3">
          <Image
            alt=""
            aria-hidden
            className="size-10 shrink-0 rounded-full object-cover"
            height={40}
            src={operatorAccount.avatarSrc}
            width={40}
          />
          <div className="grid min-w-0 gap-0.5 leading-tight">
            <span className="flex items-center gap-1 font-medium text-foreground text-sm">
              <span className="truncate">{operatorAccount.displayName}</span>
              <BadgeCheck aria-hidden className="size-4 shrink-0 text-primary" strokeWidth={2} />
              <span className="sr-only">Verified account</span>
            </span>
            <span className="truncate text-muted-foreground text-xs">
              @{operatorAccount.handle}
            </span>
          </div>
        </header>

        {/* The News Category as a condensed-italic signal word in the run's color —
            category-at-a-glance on the feed, so a long masonry triages fast (the
            word always accompanies the color; hue alone is a hint, not a key). */}
        <p className="display-locked text-[15px] leading-none" style={{ color: bandColor }}>
          {stamp}
        </p>

        {draft ? (
          <p className="whitespace-pre-line text-foreground text-sm leading-6">{draft.text}</p>
        ) : null}

        {variation ? (
          <div className="overflow-hidden rounded-xl">
            <QuoteTweetComposite
              bandColor={bandColor}
              imageAlt={variation.altText ?? variation.label}
              imageUrl={variation.url}
              label={stamp}
            />
          </div>
        ) : null}

        {sourceTweet ? <EmbeddedSourceTweet sourceTweet={sourceTweet} /> : null}

        <footer className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-border/60 pt-2 text-[11px] text-muted-foreground uppercase tracking-[0.14em]">
          <span>generated {formatRelativeTime(run.savedAt)}</span>
          {sourceTweet ? (
            <span>original tweet posted {formatRelativeTime(sourceTweet.createdAt)}</span>
          ) : null}
        </footer>
      </div>
    </article>
  );
}

/**
 * The original Source Tweet shown as the quoted post inside the card: author
 * identity, posted-time, and text. A left-rule pull-quote (no full border, per
 * the borderless card) — static and non-interactive; opening the source on X
 * lives in the Selected Run sidebar, not on the card.
 */
function EmbeddedSourceTweet({ sourceTweet }: { sourceTweet: RetrievedSourceTweet }) {
  return (
    <div className="grid gap-0.5 border-border border-l-[3px] pl-3">
      <div className="flex min-w-0 items-center gap-1">
        <span className="truncate font-medium text-foreground text-sm">
          {sourceTweet.author.displayName}
        </span>
        <span className="truncate text-muted-foreground text-xs">
          @{sourceTweet.author.username}
        </span>
        <span aria-hidden className="shrink-0 text-muted-foreground text-xs">
          ·
        </span>
        <span className="shrink-0 text-muted-foreground text-xs">
          {formatRelativeTime(sourceTweet.createdAt)}
        </span>
      </div>
      {/* Like X's quoted tweet, the original is a compact preview: whitespace is
          collapsed and the text clamps to a few lines, so a long source post can't
          stretch the card into a tall vertical strip. The full text stays in the
          DOM (clamped via CSS) and the operator opens the real post from the sidebar. */}
      <p className="line-clamp-3 text-foreground/90 text-sm leading-snug">{sourceTweet.text}</p>
    </div>
  );
}
