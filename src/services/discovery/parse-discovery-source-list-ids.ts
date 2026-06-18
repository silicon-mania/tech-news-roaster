/**
 * Parses the comma-separated `DISCOVERY_SOURCE_LIST_IDS` env var into trimmed,
 * non-blank X List ids — mirroring the Discovery Sweep route's private
 * `parseListIds` (see `app/api/discovery-sweep/route.ts`). Pure and client-safe:
 * the `/` route reads the env var server-side, calls this, and hands the
 * resulting array to the client feed, so the raw env var never enters the
 * client bundle.
 */
export function parseDiscoverySourceListIds(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((listId) => listId.trim())
    .filter((listId) => listId.length > 0);
}
