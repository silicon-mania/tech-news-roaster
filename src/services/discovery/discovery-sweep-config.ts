/**
 * Configuration for the Discovery Sweep (issue 020). The coarse pre-filter floors
 * (`minFaves`/`minReposts`) remain deliberately permissive starting values; the
 * per-sweep cap was settled in issue 021 against the serverless cost/duration
 * envelope (see below and docs/deployment.md). All three stay operator-tunable
 * against live behavior — see the "Tuning the discovery configuration" guide in
 * docs/deployment.md. The sweep itself still hard-codes no schedule or interval;
 * those live in the cron config and the sweep route (issue 021).
 */

export type DiscoverySweepConfig = {
  /**
   * The per-sweep run cap — a cost backstop on how many Automated Runs a single
   * sweep may start, so an unusually big news day cannot run away with the budget.
   * The surviving clusters are ranked by virality and only the top {@link maxRunsPerSweep}
   * start runs; the rest are logged (never silently truncated) and left for a later
   * sweep to reconsider while they remain in the trailing window. Four image
   * generations per run is the dominant cost, which is what this number bounds.
   *
   * It also bounds wall-clock: the sweep route composes kept runs sequentially, so
   * a sweep's duration ≈ cap × per-run time, and a Vercel-Cron-triggered sweep must
   * finish inside the route's serverless duration limit. The launch value (3) was
   * chosen in issue 021 to fit comfortably; raise it once real volume and the
   * deployment's duration headroom are known (docs/deployment.md).
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
  maxRunsPerSweep: 3,
  minFaves: 25,
  minReposts: 5,
};
