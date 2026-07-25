
-- 1. Pets: deceased_at
ALTER TABLE public.pets ADD COLUMN IF NOT EXISTS deceased_at date;

-- 2. Documents: new columns for S3 + lifecycle
ALTER TABLE public.documents
  ALTER COLUMN file_path DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS storage_provider text NOT NULL DEFAULT 's3',
  ADD COLUMN IF NOT EXISTS s3_bucket text,
  ADD COLUMN IF NOT EXISTS s3_key text,
  ADD COLUMN IF NOT EXISTS size_bytes bigint,
  ADD COLUMN IF NOT EXISTS content_type text,
  ADD COLUMN IF NOT EXISTS checksum text,
  ADD COLUMN IF NOT EXISTS uploaded_by_profile_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS uploaded_via text NOT NULL DEFAULT 'admin',
  ADD COLUMN IF NOT EXISTS expires_at date,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_storage_provider_chk,
  ADD CONSTRAINT documents_storage_provider_chk CHECK (storage_provider IN ('s3','supabase'));

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_uploaded_via_chk,
  ADD CONSTRAINT documents_uploaded_via_chk CHECK (uploaded_via IN ('portal','admin','system','import'));

CREATE INDEX IF NOT EXISTS documents_archive_idx ON public.documents(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS documents_expires_idx ON public.documents(expires_at) WHERE expires_at IS NOT NULL;

-- 3. Trigger: default expiry for vaccination certificates (3 years)
CREATE OR REPLACE FUNCTION public.documents_set_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.expires_at IS NULL AND lower(coalesce(NEW.type,'')) LIKE '%vaccin%' THEN
    NEW.expires_at := (coalesce(NEW.created_at, now())::date + INTERVAL '3 years')::date;
  END IF;
  IF NEW.uploaded_by_profile_id IS NULL THEN
    NEW.uploaded_by_profile_id := public.current_profile_id();
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_documents_set_defaults ON public.documents;
CREATE TRIGGER trg_documents_set_defaults
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.documents_set_defaults();

-- 4. Trigger: archive documents when pet is marked deceased
CREATE OR REPLACE FUNCTION public.pets_deceased_archive_docs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deceased_at IS NOT NULL AND (OLD.deceased_at IS NULL OR OLD.deceased_at IS DISTINCT FROM NEW.deceased_at) THEN
    UPDATE public.documents
      SET archived_at = COALESCE(archived_at, now()),
          archive_reason = COALESCE(archive_reason, 'pet_deceased')
      WHERE pet_id = NEW.id AND archived_at IS NULL;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_pets_deceased_archive_docs ON public.pets;
CREATE TRIGGER trg_pets_deceased_archive_docs
  AFTER UPDATE OF deceased_at ON public.pets
  FOR EACH ROW EXECUTE FUNCTION public.pets_deceased_archive_docs();

-- 5. Per-tenant document settings
CREATE TABLE IF NOT EXISTS public.document_settings (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  default_retention_days integer NOT NULL DEFAULT 1095, -- 3 years
  archive_grace_days integer NOT NULL DEFAULT 90,
  auto_purge_enabled boolean NOT NULL DEFAULT true,
  max_upload_mb integer NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_settings TO authenticated;
GRANT ALL ON public.document_settings TO service_role;

ALTER TABLE public.document_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_settings_staff_read ON public.document_settings;
CREATE POLICY document_settings_staff_read ON public.document_settings
  FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id));

DROP POLICY IF EXISTS document_settings_staff_write ON public.document_settings;
CREATE POLICY document_settings_staff_write ON public.document_settings
  FOR ALL TO authenticated
  USING (public.user_has_tenant_access(tenant_id))
  WITH CHECK (public.user_has_tenant_access(tenant_id));

DROP TRIGGER IF EXISTS trg_document_settings_updated ON public.document_settings;
CREATE TRIGGER trg_document_settings_updated
  BEFORE UPDATE ON public.document_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. Customer portal RLS: allow deleting their own unverified portal uploads
DROP POLICY IF EXISTS documents_customer_delete_own_portal ON public.documents;
CREATE POLICY documents_customer_delete_own_portal ON public.documents
  FOR DELETE TO authenticated
  USING (
    uploaded_via = 'portal'
    AND status = 'pending'
    AND (
      customer_id = public.current_customer_id(tenant_id)
      OR (pet_id IS NOT NULL AND public.user_can_access_pet(tenant_id, pet_id))
    )
  );

-- 7. RPC used by edge functions: hard-delete after grace period (staff/service_role only)
CREATE OR REPLACE FUNCTION public.document_hard_delete(p_document_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_doc public.documents;
BEGIN
  SELECT * INTO v_doc FROM public.documents WHERE id = p_document_id;
  IF v_doc.id IS NULL THEN RETURN; END IF;
  IF NOT (public.user_has_tenant_access(v_doc.tenant_id) OR public.is_platform_owner()) THEN
    RAISE EXCEPTION 'Not authorised to purge this document';
  END IF;
  DELETE FROM public.documents WHERE id = p_document_id;
END; $$;

REVOKE ALL ON FUNCTION public.document_hard_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.document_hard_delete(uuid) TO authenticated, service_role;
