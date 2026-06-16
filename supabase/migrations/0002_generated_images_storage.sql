-- Object storage for generated image bytes (ADR-0019, issue 012).
--
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
