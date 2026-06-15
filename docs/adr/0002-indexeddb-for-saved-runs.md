# IndexedDB For Saved Runs

> **Status: superseded by [ADR-0019](0019-server-side-persistence-and-single-operator-auth.md).** A server-side process cannot write to a browser's IndexedDB, so automated runs require server persistence. Runs now live in a managed Postgres (Supabase) under the operator account, with images in object storage. The original reasoning is kept below for history.

Saved runs are persisted in IndexedDB by default rather than localStorage. We chose IndexedDB because saved runs are structured browser-only records that can accumulate over time, and IndexedDB gives us better capacity and shape for reopening, editing, and deleting run history without adding a backend.
