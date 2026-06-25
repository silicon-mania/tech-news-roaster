import { cn } from "@/lib/utils";

// The six LOCKED IN signal hues in palette order, read from the shared tokens
// (defined in globals.css, mirroring categoryBandColors) so the bug never forks
// the palette.
const SIGNAL_BUG_COLORS = [
  "var(--signal-green)",
  "var(--signal-yellow)",
  "var(--signal-orange)",
  "var(--signal-red)",
  "var(--signal-purple)",
  "var(--signal-blue)",
];

/**
 * The LOCKED IN signal-bar bug (ADR-0030): the six signal hues as a row of small
 * angular parallelogram stripes — the brand's supporting device, used beside the
 * wordmark in the masthead. Decorative (`aria-hidden`); the wordmark carries the
 * accessible name.
 */
export function SignalBug({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex items-center gap-[3px]", className)}>
      {SIGNAL_BUG_COLORS.map((color) => (
        <span
          className="block h-3.5 w-2 -skew-x-12 rounded-[1px]"
          key={color}
          style={{ backgroundColor: color }}
        />
      ))}
    </span>
  );
}
