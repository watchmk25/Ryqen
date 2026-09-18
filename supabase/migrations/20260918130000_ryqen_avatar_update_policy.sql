-- Ryqen V0.1 avatar replacement authorization.
--
-- Supabase Storage upsert requires UPDATE authorization for the existing
-- object as well as validation of the resulting object. Keep both checks
-- constrained to the authenticated user's folder in the avatars bucket.

ALTER POLICY "users can update their own avatar" ON storage.objects
  USING ((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]))
  WITH CHECK ((bucket_id = 'avatars'::text) AND ((auth.uid())::text = (storage.foldername(name))[1]));
