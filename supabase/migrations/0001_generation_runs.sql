-- Server-side Saved Run persistence (ADR-0019, issue 011).
--
-- One row per run, owned by the single Operator Account. The full run lives in
-- the `payload` JSONB column (validated by parseSavedGenerationRun before it is
-- written); `origin`, `saved_at`, and `seen_at` are mirrored as columns for
-- ordering, pagination, and the future unseen-runs filter. Generated image
-- bytes are NOT stored here — they land in object storage in issue 012.

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
