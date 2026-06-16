// Public contract for the Discovery virality-scoring feature (issue 015). Only the
// pure, client-safe modules are re-exported. The server-only persistence
// (supabase-author-baseline-repository, author-baseline-store) is imported directly
// by the Discovery Sweep so client bundles never reach Supabase service keys —
// mirroring the saved-runs barrel and the generation-orchestrator exception in
// CLAUDE.md.
export * from "./author-baseline";
export * from "./author-baseline-repository";
export * from "./author-relative-virality";
export * from "./author-tweet-sampler";
export * from "./in-memory-author-baseline-repository";
export * from "./resolve-author-baseline";
export * from "./virality-config";
export * from "./virality-scoring";
