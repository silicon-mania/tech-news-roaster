# Server-Side Persistence and Single-Operator Authentication

All persistence moves server-side onto Supabase (managed Postgres plus object storage), behind a single authenticated operator account that signs in with email and a one-time code. We chose this because automating discovery and generation requires a server process — the scheduled tweet discovery sweep — to create and store runs while the operator is away and no browser is open, and browser-only IndexedDB is unreachable from a server. This supersedes [ADR-0001](0001-browser-only-saved-runs.md), [ADR-0002](0002-indexeddb-for-saved-runs.md), and [ADR-0008](0008-browser-only-image-persistence-with-retention.md).

The server store holds runs (both manual and automated) and their selections, generated image bytes (object storage), per-author baselines, the seen-tweet record that lets discovery sweeps overlap safely, and news coverage clusters. The [ADR-0018](0018-deterministic-derived-final-quote-tweet-image.md) derive-on-demand contract for the Final Quote Tweet Image is unchanged: its inputs and the variation image bytes simply live server-side now instead of in the browser.

## Consequences

The ten-latest Saved Run Retention cap is dropped: automated runs accumulate continuously, so a fixed count no longer makes sense; the runs list is paginated, with an age-based limit possible later. Cross-device continuity comes for free once the operator signs in.

## Considered Options

We considered keeping manual runs in IndexedDB and persisting only automated runs server-side, but rejected the dual store: it gives two sources of truth, no unified runs list, and leaves the operator unable to see automated runs from whichever device did not create them. A single server store backs one unified list. Supabase was chosen over assembling separate database, auth, and storage services because it bundles managed Postgres, native email-OTP auth, and object storage in one platform — the right amount of glue for a single-user internal tool. Signup is restricted to one allowlisted operator email so a random visitor cannot create the account.
