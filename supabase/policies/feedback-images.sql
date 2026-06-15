-- Storage bucket policies for `feedback-images`.
--
-- These target `storage.objects` (Supabase-managed schema) and are NOT tracked
-- by Drizzle migrations. Apply by hand via the Supabase SQL editor whenever
-- the bucket is (re)created on a new environment.
--
-- Bucket itself must already exist (create via Supabase dashboard → Storage).

-- Uploads go through the API (`api/v1/public/comments.ts`), which writes with
-- the service-role client — that bypasses storage RLS, so no anon insert policy
-- is needed. We explicitly drop the old one so existing environments stop
-- accepting direct anon uploads with the publishable key.
drop policy if exists "anon upload feedback images" on storage.objects;

-- Allow public read of feedback images
drop policy if exists "public read feedback images" on storage.objects;
create policy "public read feedback images"
  on storage.objects
  for select
  to public
  using (bucket_id = 'feedback-images');
