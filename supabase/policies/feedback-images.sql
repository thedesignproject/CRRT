-- Storage bucket policies for `feedback-images`.
--
-- These target `storage.objects` (Supabase-managed schema) and are NOT tracked
-- by Drizzle migrations. Apply by hand via the Supabase SQL editor whenever
-- the bucket is (re)created on a new environment.
--
-- Bucket itself must already exist (create via Supabase dashboard → Storage).

-- Allow anyone to upload into feedback-images (widget runs as anon)
drop policy if exists "anon upload feedback images" on storage.objects;
create policy "anon upload feedback images"
  on storage.objects
  for insert
  to anon
  with check (bucket_id = 'feedback-images');

-- Allow public read of feedback images
drop policy if exists "public read feedback images" on storage.objects;
create policy "public read feedback images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'feedback-images');
