// Public contract for the auth feature. Only the pure, client-safe modules are
// re-exported here. Server-only modules that pull in the Supabase SDK or
// `next/headers` (supabase-server-client, operator-session, operator-auth,
// middleware-session) are imported directly by routes and middleware so client
// bundles never reach server code — mirroring the generation-orchestrator
// exception in CLAUDE.md.
export * from "./operator-allowlist";
export * from "./operator-gate";
export * from "./supabase-config";
