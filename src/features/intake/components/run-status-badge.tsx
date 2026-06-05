import type { GenerationRun } from "../types";

type RunStatusBadgeProps = {
  status: GenerationRun["status"];
  compact?: boolean;
};

export function RunStatusBadge({
  compact = false,
  status,
}: RunStatusBadgeProps) {
  const label = status === "running" ? "Running" : "Complete";

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sky-300 text-xs">
        <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sky-300" />
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-400/30 px-3 py-1 text-sky-200 text-sm">
      <span aria-hidden="true" className="h-2 w-2 rounded-full bg-sky-300" />
      {label}
    </span>
  );
}
