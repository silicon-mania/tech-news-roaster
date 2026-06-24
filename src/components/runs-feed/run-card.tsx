import {
  BadgeCheck,
  BarChart3,
  Heart,
  type LucideIcon,
  MessageCircle,
  Repeat2,
} from "lucide-react";
import Image from "next/image";
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

// Decorative engagement chrome. A Quote Repost preview is unposted, so these
// counts are fixed dressing that make the card read like a real X post; the row
// is aria-hidden because it carries no real state.
const engagementChrome: { Icon: LucideIcon; key: string; value: string }[] = [
  { Icon: MessageCircle, key: "replies", value: "18" },
  { Icon: Repeat2, key: "reposts", value: "7" },
  { Icon: Heart, key: "likes", value: "124" },
  { Icon: BarChart3, key: "views", value: "12.4K" },
];

/**
 * A faithful preview of the Quote Repost a Complete Run becomes, composed as an X
 * quote-repost post: the fixed Operator Account header, the resolved Selected
 * Draft as commentary, the reused Final Quote Tweet Image composite as media, the
 * Source Tweet embedded as the static quoted post, and decorative engagement
 * chrome — with "generated X ago" and "original tweet posted Y ago" beneath.
 *
 * Content slots resolve the operator's explicit choice or fall back to
 * first-of-each ({@link resolveRunCardContent}); the fallback is display-only and
 * persists nothing. The run label is the card's accessible name, not painted, so
 * the preview reads like a genuine post rather than an internal list row.
 */
export function RunCard({ run, onSelect }: RunCardProps) {
  const { draft, sourceTweet, variation } = resolveRunCardContent(run);

  return (
    <article aria-label={run.label} className="grid gap-2">
      <div className="relative grid gap-3 rounded-xl bg-card px-5 py-4">
        {onSelect ? (
          // A full-card overlay button — the card's content is non-interactive
          // (the embedded Source Tweet is static, the chrome decorative), so the
          // whole preview is a single click target that opens the sidebar.
          <button
            aria-label={`Open ${run.label}`}
            className="absolute inset-0 z-10 rounded-xl transition-colors hover:bg-foreground/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            onClick={() => onSelect(run.id)}
            type="button"
          />
        ) : null}
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

        {draft ? (
          <p className="whitespace-pre-line text-foreground text-sm leading-6">{draft.text}</p>
        ) : null}

        {variation ? (
          <div className="overflow-hidden rounded-xl">
            <QuoteTweetComposite
              bandColor={resolveBandColor(run.newsCategory, run.newsCategoryColor)}
              imageAlt={variation.altText ?? variation.label}
              imageUrl={variation.url}
              label={resolveNewsCategoryStamp(run.newsCategory)}
            />
          </div>
        ) : null}

        {sourceTweet ? <EmbeddedSourceTweet sourceTweet={sourceTweet} /> : null}

        <div aria-hidden className="mt-0.5 flex items-center justify-between text-muted-foreground">
          {engagementChrome.map(({ Icon, key, value }) => (
            <span className="flex items-center gap-1.5 text-xs" key={key}>
              <Icon className="size-4" strokeWidth={1.75} />
              {value}
            </span>
          ))}
        </div>
      </div>

      <footer className="flex flex-wrap gap-x-3 gap-y-0.5 px-1 text-muted-foreground text-xs">
        <span>generated {formatRelativeTime(run.savedAt)}</span>
        {sourceTweet ? (
          <span>original tweet posted {formatRelativeTime(sourceTweet.createdAt)}</span>
        ) : null}
      </footer>
    </article>
  );
}

/**
 * The original Source Tweet shown as the quoted post inside the card: author
 * identity, posted-time, and text. Static and non-interactive — opening the
 * source on X lives in the Selected Run sidebar, not on the card.
 */
function EmbeddedSourceTweet({ sourceTweet }: { sourceTweet: RetrievedSourceTweet }) {
  return (
    <div className="grid gap-0.5 rounded-xl border border-border px-3 py-2.5">
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
