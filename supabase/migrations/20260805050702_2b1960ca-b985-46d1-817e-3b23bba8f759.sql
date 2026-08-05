CREATE TABLE public.upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  pet_id uuid REFERENCES public.pets(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES public.bookings(id) ON DELETE CASCADE,
  doc_type text NOT NULL DEFAULT 'other',
  label text,
  created_by_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  max_files integer NOT NULL DEFAULT 10,
  files_uploaded integer NOT NULL DEFAULT 0,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX upload_sessions_token_idx ON public.upload_sessions (token);
CREATE INDEX upload_sessions_tenant_idx ON public.upload_sessions (tenant_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.upload_sessions TO authenticated;
GRANT ALL ON public.upload_sessions TO service_role;

ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upload_sessions_staff_all" ON public.upload_sessions
  FOR ALL TO authenticated
  USING (user_has_tenant_access(tenant_id))
  WITH CHECK (user_has_tenant_access(tenant_id));

CREATE POLICY "upload_sessions_owner_select" ON public.upload_sessions
  FOR SELECT TO authenticated
  USING (created_by_profile_id = current_profile_id());

CREATE POLICY "upload_sessions_owner_update" ON public.upload_sessions
  FOR UPDATE TO authenticated
  USING (created_by_profile_id = current_profile_id())
  WITH CHECK (created_by_profile_id = current_profile_id());

CREATE TRIGGER upload_sessions_set_updated_at
  BEFORE UPDATE ON public.upload_sessions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS upload_session_id uuid REFERENCES public.upload_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS documents_upload_session_idx ON public.documents (upload_session_id);

ALTER TABLE public.document_settings
  ADD COLUMN IF NOT EXISTS snap_expiry_minutes integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS snap_max_files integer NOT NULL DEFAULT 10;