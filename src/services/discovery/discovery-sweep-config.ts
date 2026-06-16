/**
 * Documented defaults for the Discovery Sweep (issue 020). Like the virality and
 * clustering defaults these are deliberately permissive starting values, not tuned
 * thresholds: exact tuning — the per-sweep cap and the coarse pre-filter floors —
 * is deferred to issue 021 (see docs/adr/0020-automated-discovery-via-api-list-polling.md).
 * The sweep itself hard-codes no schedule or interval; those are 021's concern too.
 */

export type DiscoverySweepConfig = {
  /**
   * The per-sweep run cap — a cost backstop on how many Automated Runs a single
   * sweep may start, so an unusually big news day cannot run away with the budget.
   * The surviving clusters are ranked by virality and only the top {@link maxRunsPerSweep}
   * start runs; the rest are logged (never silently truncated) and left for a later
   * sweep to reconsider while they remain in the trailing window. Four image
   * generations per run is the dominant cost, which is what this number bounds.
   */
  maxRunsPerSweep: number;
  /**
   * Coarse server-side recall floor on likes, passed to the List-timeline adapter's
   * `min_faves:` operator. Not the virality bar — author-relative scoring still runs
   * in-house on the survivors — so it stays conservatively low: high enough to shed
   * the near-zero-engagement tail cheaply, low enough not to drop a small account's
   * genuine breakout (recall over precision).
   */
  minFaves: number;
  /**
   * Coarse server-side recall floor on reposts, passed to the List-timeline adapter's
   * `min_retweets:` operator. Conservatively low for the same recall reason as
   * {@link minFaves}.
   */
  minReposts: number;
};

export const defaultDiscoverySweepConfig: DiscoverySweepConfig = {
  maxRunsPerSweep: 10,
  minFaves: 25,
  minReposts: 5,
};
