-- News Coverage Clusters and the seen-tweet record (ADR-0020, issue 016).
--
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
