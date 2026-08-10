
ALTER TABLE public.bookings
  ADD COLUMN IF NOT EXISTS vax_override_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS vax_override_reason text,
  ADD COLUMN IF NOT EXISTS vax_override_at timestamptz;

CREATE OR REPLACE FUNCTION public.vax_code_norm(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT trim(both '_' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '_', 'g'));
$$;

CREATE OR REPLACE FUNCTION public.pet_vaccination_status(
  p_pet_id uuid,
  p_service_type text DEFAULT NULL,
  p_on date DEFAULT NULL
)
RETURNS TABLE(
  pet_id uuid,
  pet_name text,
  vaccine_type text,
  label text,
  service_type text,
  status text,
  expiry_date date,
  has_certificate boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pet public.pets;
  v_on date := COALESCE(p_on, CURRENT_DATE);
BEGIN
  SELECT * INTO v_pet FROM public.pets WHERE id = p_pet_id;
  IF v_pet.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH required_rules AS (
    SELECT DISTINCT ON (public.vax_code_norm(r.vaccine_type))
      public.vax_code_norm(r.vaccine_type) AS code,
      r.service_type::text AS svc,
      COALESCE(r.grace_days, 0) AS grace_days
    FROM public.vaccination_rules r
    WHERE r.tenant_id = v_pet.tenant_id
      AND r.required = true
      AND (p_service_type IS NULL OR r.service_type::text = p_service_type)
      AND (r.species = v_pet.species::text OR r.species IN ('any', 'all'))
    ORDER BY public.vax_code_norm(r.vaccine_type), r.service_type::text
  ),
  latest_vax AS (
    SELECT DISTINCT ON (public.vax_code_norm(v.vaccination_type))
      public.vax_code_norm(v.vaccination_type) AS code,
      v.expiry_date,
      v.verified,
      v.document_id
    FROM public.vaccinations v
    WHERE v.pet_id = p_pet_id
    ORDER BY public.vax_code_norm(v.vaccination_type), v.administered_date DESC NULLS LAST
  ),
  certs AS (
    SELECT count(*) AS n
    FROM public.documents d
    WHERE d.pet_id = p_pet_id AND d.type = 'vaccination' AND d.archived_at IS NULL
  )
  SELECT
    v_pet.id,
    v_pet.name,
    r.code,
    COALESCE(vt.name, initcap(replace(r.code, '_', ' '))),
    r.svc,
    CASE
      WHEN lv.code IS NULL
        AND v_pet.vax_waived_until IS NOT NULL AND v_pet.vax_waived_until >= v_on THEN 'waived'
      WHEN lv.code IS NULL THEN 'missing'
      WHEN lv.expiry_date IS NULL THEN 'no_expiry'
      WHEN lv.expiry_date < (v_on - (r.grace_days || ' days')::interval)::date THEN
        CASE WHEN v_pet.vax_waived_until IS NOT NULL AND v_pet.vax_waived_until >= v_on
             THEN 'waived' ELSE 'expired' END
      WHEN lv.document_id IS NULL AND (SELECT n FROM certs) = 0 THEN
        CASE WHEN v_pet.vax_waived_until IS NOT NULL AND v_pet.vax_waived_until >= v_on
             THEN 'waived' ELSE 'no_certificate' END
      ELSE 'ok'
    END,
    lv.expiry_date,
    (lv.document_id IS NOT NULL OR (SELECT n FROM certs) > 0)
  FROM required_rules r
  LEFT JOIN latest_vax lv ON lv.code = r.code
  LEFT JOIN public.vaccine_types vt
    ON vt.tenant_id = v_pet.tenant_id
   AND public.vax_code_norm(vt.code) = r.code
   AND vt.species = v_pet.species::text
  ORDER BY r.code;
END;
$$;

CREATE OR REPLACE FUNCTION public.booking_vaccination_gate(p_booking_id uuid)
RETURNS TABLE(
  pet_id uuid,
  pet_name text,
  vaccine_type text,
  label text,
  status text,
  expiry_date date,
  has_certificate boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT s.pet_id, s.pet_name, s.vaccine_type, s.label, s.status, s.expiry_date, s.has_certificate
  FROM public.booking_pets bp
  CROSS JOIN LATERAL public.pet_vaccination_status(
    bp.pet_id,
    v_booking.service_type::text,
    COALESCE(v_booking.start_date, CURRENT_DATE)
  ) s
  WHERE bp.booking_id = p_booking_id
  ORDER BY s.pet_name, s.vaccine_type;
END;
$$;

REVOKE ALL ON FUNCTION public.pet_vaccination_status(uuid, text, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.booking_vaccination_gate(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.vax_code_norm(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pet_vaccination_status(uuid, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.booking_vaccination_gate(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.vax_code_norm(text) TO authenticated, service_role;
