ALTER TABLE public.hotel_workflow_settings ADD COLUMN IF NOT EXISTS photo_gate_mode text NOT NULL DEFAULT 'hard';
ALTER TABLE public.daycare_workflow_settings ADD COLUMN IF NOT EXISTS photo_gate_mode text NOT NULL DEFAULT 'hard';
ALTER TABLE public.grooming_workflow_settings ADD COLUMN IF NOT EXISTS photo_gate_mode text NOT NULL DEFAULT 'off';
ALTER TABLE public.transport_workflow_settings ADD COLUMN IF NOT EXISTS photo_gate_mode text NOT NULL DEFAULT 'off';

ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS photo_waived_until date,
  ADD COLUMN IF NOT EXISTS photo_waiver_reason text,
  ADD COLUMN IF NOT EXISTS photo_waiver_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS photo_waiver_at timestamptz;

CREATE OR REPLACE FUNCTION public.pet_photo_status(p_pet_ids uuid[])
RETURNS TABLE(pet_id uuid, has_photo boolean, document_id uuid, waived_until date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.id,
    d.id IS NOT NULL,
    d.id,
    p.photo_waived_until
  FROM public.pets p
  LEFT JOIN LATERAL (
    SELECT dd.id
    FROM public.documents dd
    WHERE dd.pet_id = p.id
      AND dd.type = 'pet_photo'
      AND dd.deleted_at IS NULL
      AND dd.status::text <> 'rejected'
    ORDER BY dd.created_at DESC
    LIMIT 1
  ) d ON true
  WHERE p.id = ANY(p_pet_ids)
    AND public.user_has_tenant_access(p.tenant_id);
$$;

REVOKE ALL ON FUNCTION public.pet_photo_status(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pet_photo_status(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.booking_photo_gate(p_booking_id uuid)
RETURNS TABLE(pet_id uuid, pet_name text, status text)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.name,
    CASE
      WHEN d.id IS NOT NULL THEN 'ok'
      WHEN p.photo_waived_until IS NOT NULL
       AND p.photo_waived_until >= COALESCE(v_booking.start_date, now()::date) THEN 'waived'
      ELSE 'missing'
    END
  FROM public.booking_pets bp
  JOIN public.pets p ON p.id = bp.pet_id
  LEFT JOIN LATERAL (
    SELECT dd.id
    FROM public.documents dd
    WHERE dd.pet_id = p.id
      AND dd.type = 'pet_photo'
      AND dd.deleted_at IS NULL
      AND dd.status::text <> 'rejected'
    LIMIT 1
  ) d ON true
  WHERE bp.booking_id = p_booking_id
  ORDER BY p.name;
END;
$$;

REVOKE ALL ON FUNCTION public.booking_photo_gate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.booking_photo_gate(uuid) TO authenticated;