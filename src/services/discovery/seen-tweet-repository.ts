/**
 * The persistence port for the seen-tweet record — the durable set of tweet ids a
 * sweep has already considered. `filterUnseen` returns the subset of ids not yet
 * recorded, so consecutive sweeps can overlap their trailing windows without ever
 * processing the same tweet twice; `markSeen` records ids once handled.
 * Implementations are owner-scoped by construction (one Operator Account).
 */
export type SeenTweetRepository = {
  filterUnseen(tweetIds: string[]): Promise<string[]>;
  markSeen(tweetIds: string[]): Promise<void>;
};
