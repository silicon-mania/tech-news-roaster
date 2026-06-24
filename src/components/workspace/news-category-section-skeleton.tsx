import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// One placeholder per vocabulary chip, widths staggered to echo the real labels
// (LAUNCHED is wide, FIRED narrow) so the skeleton wraps into the same two-ish rows
// the loaded chips do — the run settles into this footprint with no layout shift.
const chipWidths = ["w-28", "w-24", "w-28", "w-20", "w-16", "w-28", "w-20", "w-28", "w-16", "w-16"];

/**
 * The loading shape of {@link NewsCategorySection} — the chip grid and custom field
 * as pulsing placeholders, sized to the real section's footprint. The workspace
 * shows it while a run is in flight (the classifier result only lands on
 * completion, ADR-0027 / issue 004), under the same "News category" SectionHeader
 * the loaded section sits beneath, so nothing shifts when the chips arrive.
 *
 * It renders only the section's content; the surface supplies the labeled section
 * and heading, exactly as the real {@link NewsCategorySection} does.
 */
export function NewsCategorySectionSkeleton() {
  return (
    <div aria-hidden className="grid gap-4">
      <div className="flex flex-wrap gap-x-2 gap-y-2">
        {chipWidths.map((width, index) => (
          <Skeleton
            className={cn("h-9 rounded-lg", width)}
            // biome-ignore lint/suspicious/noArrayIndexKey: chip placeholders are positional, no identity
            key={`chip-${index}`}
          />
        ))}
      </div>
      <Skeleton className="h-9 w-full max-w-sm rounded-lg" />
    </div>
  );
}
