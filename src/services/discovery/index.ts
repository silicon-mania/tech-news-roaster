// Public contract for the Discovery feature (issues 015, 016). Only the pure,
// client-safe modules are re-exported. The server-only persistence (the supabase-*
// repositories and the *-store resolvers) is imported directly by the Discovery
// Sweep so client bundles never reach Supabase service keys — mirroring the
// saved-runs barrel and the generation-orchestrator exception in CLAUDE.md.
export * from "./author-baseline";
export * from "./author-baseline-repository";
export * from "./author-relative-virality";
export * from "./author-tweet-sampler";
export * from "./cluster-similarity";
export * from "./cluster-viral-tweets";
export * from "./clustering-config";
export * from "./in-memory-author-baseline-repository";
export * from "./in-memory-news-coverage-cluster-repository";
export * from "./in-memory-seen-tweet-repository";
export * from "./news-coverage-cluster";
export * from "./news-coverage-cluster-repository";
export * from "./resolve-author-baseline";
export * from "./seen-tweet-repository";
export * from "./virality-config";
export * from "./virality-scoring";
