-- Author Baselines for author-relative virality scoring (ADR-0020, issue 015).
--
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
