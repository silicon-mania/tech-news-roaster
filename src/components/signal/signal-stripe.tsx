import { cn } from "@/lib/utils";

/**
 * The LOCKED IN signal stripe (ADR-0030): a thin angular bar that flies a run's
 * one signal color — the same hex the X Quote Repost poster bands with, so the
 * stripe reads as the band's color escaping the poster into the UI. The slight
 * parallelogram (clip-path, fixed fraction of the width so it stays near-vertical
 * at any height) carries the brand's "angular, kinetic, directional" feel without
 * leaning across the surface.
 *
 * At rest it is low-alpha; on a `group` ancestor's hover/focus it lifts to full
 * saturation — the click affordance on the otherwise borderless Run Card. Pass
 * `lit` for surfaces that should always be full strength (e.g. a selected run).
 */
export function SignalStripe({
  color,
  lit = false,
  className,
}: {
  /** The run's News Category Color (the resolved band hex). */
  color: string;
  /** Render at full saturation regardless of hover (selected/active surfaces). */
  lit?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "block w-1.5 shrink-0 transition-opacity duration-200",
        lit ? "opacity-100" : "opacity-25 group-hover:opacity-100 group-focus-within:opacity-100",
        className,
      )}
      style={{
        backgroundColor: color,
        clipPath: "polygon(38% 0, 100% 0, 62% 100%, 0 100%)",
      }}
    />
  );
}
