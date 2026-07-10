
-- Files live under `<tenant_id>/...`
CREATE POLICY "Branding read for authenticated"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tenant-branding');

CREATE POLICY "Branding write with permission"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tenant-branding'
    AND public.user_has_permission((storage.foldername(name))[1]::uuid, 'settings.branding.manage')
  );

CREATE POLICY "Branding update with permission"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND public.user_has_permission((storage.foldername(name))[1]::uuid, 'settings.branding.manage')
  );

CREATE POLICY "Branding delete with permission"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND public.user_has_permission((storage.foldername(name))[1]::uuid, 'settings.branding.manage')
  );
