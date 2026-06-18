/**
 * Formats an ISO-8601 timestamp as a coarse relative phrase — "just now",
 * "5 minutes ago", "2 weeks ago". Extracted from the workspace runs list so the
 * Runs Feed's Run Card renders its two timestamps ("generated X ago", "original
 * tweet posted Y ago") with the exact same wording. An absent timestamp (an
 * unsaved run) reads as "just now".
 */
export function formatRelativeTime(isoTimestamp: string | undefined) {
  if (!isoTimestamp) {
    return "just now";
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - Date.parse(isoTimestamp)) / 1000));
  const elapsedMinutes = Math.floor(elapsedSeconds / 60);
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  const elapsedDays = Math.floor(elapsedHours / 24);
  const elapsedWeeks = Math.floor(elapsedDays / 7);

  if (elapsedMinutes < 1) {
    return "just now";
  }

  if (elapsedMinutes < 60) {
    return `${elapsedMinutes} ${pluralize("minute", elapsedMinutes)} ago`;
  }

  if (elapsedHours < 24) {
    return `${elapsedHours} ${pluralize("hour", elapsedHours)} ago`;
  }

  if (elapsedDays < 14) {
    return `${elapsedDays} ${pluralize("day", elapsedDays)} ago`;
  }

  return `${elapsedWeeks} ${pluralize("week", elapsedWeeks)} ago`;
}

function pluralize(unit: string, count: number) {
  return count === 1 ? unit : `${unit}s`;
}
