// Vitest has no Next.js bundler, so the `server-only` import guard is aliased
// to this empty module during tests (see vitest.config.mts). Server-only
// modules still run their actual logic under test; only the guard is no-op'd.
export {};
