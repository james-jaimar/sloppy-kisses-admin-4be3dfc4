CREATE POLICY "grooming refs style read" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'grooming-references' AND (storage.foldername(name))[2] = 'styles');
CREATE POLICY "grooming refs member read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'grooming-references' AND (
    public.user_has_tenant_access(((storage.foldername(name))[1])::uuid)
    OR ((storage.foldername(name))[1])::uuid IN (SELECT c.tenant_id FROM public.customers c WHERE c.linked_profile_id = public.current_profile_id())
  ));