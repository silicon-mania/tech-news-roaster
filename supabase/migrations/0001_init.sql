-- Fresh init: the entire database schema in one migration.
--
-- This single migration reproduces today's schema exactly when applied to an
-- empty database — it replaces the prior four migrations (generation runs,
-- generated-image storage, author baselines, news-coverage clusters /
-- seen-tweets), whose history was consolidated here (ADR-0026). No visual-joke
-- schema ever existed (visual jokes lived in the run payload JSON), so this is a
-- pure migration-history consolidation; no data migration is performed.
--
-- Objects created: the `generation_runs`, `author_baselines`,
-- `news_coverage_clusters`, and `seen_tweets` tables (each with its index and an
-- owner-scoped RLS policy), plus the private `generated-images` storage bucket
-- and its owner-scoped policy on `storage.objects`.

-- ---------------------------------------------------------------------------
-- Saved Run persistence (ADR-0019)
-- ---------------------------------------------------------------------------
-- One row per run, owned by the single Operator Account. The full run lives in
-- the `payload` JSONB column (validated by parseSavedGenerationRun before it is
-- written); `origin`, `saved_at`, and `seen_at` are mirrored as columns for
-- ordering, pagination, and the unseen-runs filter. Generated image bytes are
-- NOT stored here — they land in object storage (see the bucket below).

create table if not exists public.generation_runs (
  owner_id   uuid        not null references auth.users (id) on delete cascade,
  id         text        not null,
  origin     text        not null default 'manual' check (origin in ('manual', 'automated')),
  saved_at   timestamptz,
  seen_at    timestamptz,
  payload    jsonb       not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_id, id)
);

-- Newest-saved-first listing and keyset/offset pagination per operator.
create index if not exists generation_runs_owner_saved_at_idx
  on public.generation_runs (owner_id, saved_at desc);

-- Defense in depth: the routes reach this table with the service-role key and
-- already filter by owner_id, but row-level security keeps any anon/JWT access
-- scoped to the signed-in operator's own rows.
alter table public.generation_runs enable row level security;

drop policy if exists generation_runs_owner_rw on public.generation_runs;
create policy generation_runs_owner_rw
  on public.generation_runs
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Author Baselines for author-relative virality scoring (ADR-0020)
-- ---------------------------------------------------------------------------
-- One row per (operator, author). An author's baseline velocity — their normal
-- engagement-over-age — is computed lazily the first time one of their tweets
-- surfaces in discovery, persisted here, and recomputed on a cadence. The full
-- baseline lives in the `payload` JSONB column (validated by authorBaselineSchema
-- before it is written); `baseline_velocity`, `sample_size`, and `computed_at`
-- are mirrored as columns for inspection and staleness queries.

create table if not exists public.author_baselines (
  owner_id          uuid             not null references auth.users (id) on delete cascade,
  author_username   text             not null,
  baseline_velocity double precision not null,
  sample_size       integer          not null default 0,
  computed_at       timestamptz      not null,
  payload           jsonb            not null,
  created_at        timestamptz      not null default now(),
  updated_at        timestamptz      not null default now(),
  primary key (owner_id, author_username)
);

-- Staleness scans ("which of this operator's baselines are due for refresh").
create index if not exists author_baselines_owner_computed_at_idx
  on public.author_baselines (owner_id, computed_at);

-- Defense in depth: the sweep reaches this table with the service-role key and
-- already filters by owner_id, but row-level security keeps any anon/JWT access
-- scoped to the signed-in operator's own rows.
alter table public.author_baselines enable row level security;

drop policy if exists author_baselines_owner_rw on public.author_baselines;
create policy author_baselines_owner_rw
  on public.author_baselines
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- News Coverage Clusters and the seen-tweet record (ADR-0020)
-- ---------------------------------------------------------------------------
-- Clustering groups qualifying viral tweets about the same news so one event makes
-- at most one Automated Run, and the seen-tweet record lets consecutive sweeps
-- overlap their trailing windows without ever processing a tweet twice. Both are
-- owned by the single Operator Account.

-- One row per News Coverage Cluster. The full cluster lives in the `payload` JSONB
-- column (validated by parseNewsCoverageCluster before it is written);
-- `earliest_created_at` mirrors the Source Tweet's post time for the window scan,
-- and `run_id` records the one run the cluster produced — null until then, and what
-- makes the no-second-run guarantee durable across overlapping sweeps.
create table if not exists public.news_coverage_clusters (
  owner_id            uuid        not null references auth.users (id) on delete cascade,
  id                  text        not null,
  source_tweet_id     text        not null,
  earliest_created_at timestamptz not null,
  run_id              text,
  payload             jsonb       not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (owner_id, id)
);

-- Window scan ("which of this operator's clusters are still inside the clustering
-- window so a new viral tweet might join them").
create index if not exists news_coverage_clusters_owner_earliest_idx
  on public.news_coverage_clusters (owner_id, earliest_created_at);

-- One row per (operator, tweet) the discovery sweep has already considered. The
-- sweep reads back which ids in a window are present and processes only the rest,
-- so overlapping windows lose nothing at the edges and never duplicate a run.
create table if not exists public.seen_tweets (
  owner_id uuid        not null references auth.users (id) on delete cascade,
  tweet_id text        not null,
  seen_at  timestamptz not null default now(),
  primary key (owner_id, tweet_id)
);

-- Defense in depth: the sweep reaches these tables with the service-role key and
-- already filters by owner_id, but row-level security keeps any anon/JWT access
-- scoped to the signed-in operator's own rows.
alter table public.news_coverage_clusters enable row level security;
alter table public.seen_tweets enable row level security;

drop policy if exists news_coverage_clusters_owner_rw on public.news_coverage_clusters;
create policy news_coverage_clusters_owner_rw
  on public.news_coverage_clusters
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists seen_tweets_owner_rw on public.seen_tweets;
create policy seen_tweets_owner_rw
  on public.seen_tweets
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Object storage for generated image bytes (ADR-0019, ADR-0018)
-- ---------------------------------------------------------------------------
-- The Image Set's four variation bytes and the Selected Image Original are
-- written here on image generation and read back through `/api/runs/:runId/
-- images/:optionId`, so image-heavy runs survive outside the browser and the
-- Final Quote Tweet Image recomposes from stored bytes on reopen (ADR-0018).
--
-- Keys are `<owner_id>/<run_id>/<option_id>`. The routes reach storage with the
-- service-role key (which bypasses RLS) and already scope every key by owner, so
-- a storage key or credential never reaches the client.

-- Private bucket: bytes are only ever served through the owner-gated route.
insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', false)
on conflict (id) do nothing;

-- Defense in depth: RLS on storage.objects (enabled by Supabase) keeps any
-- anon/JWT access scoped to the signed-in operator's own object prefix — the
-- first path segment of the key is the owner id.
drop policy if exists generated_images_owner_rw on storage.objects;
create policy generated_images_owner_rw
  on storage.objects
  for all
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
