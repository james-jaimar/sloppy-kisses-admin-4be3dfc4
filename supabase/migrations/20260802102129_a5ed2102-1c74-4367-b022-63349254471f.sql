ALTER TABLE public.pets
  ADD COLUMN IF NOT EXISTS vax_waived_until date,
  ADD COLUMN IF NOT EXISTS vax_waiver_reason text,
  ADD COLUMN IF NOT EXISTS vax_waiver_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS vax_waiver_at timestamptz;

CREATE OR REPLACE FUNCTION public.grooming_can_confirm_booking(p_booking_id uuid)
 RETURNS TABLE(pet_id uuid, pet_name text, vaccine_type text, status text, expiry_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH pets_on_booking AS (
    SELECT p.id AS pet_id, p.name AS pet_name, p.species::text AS species,
           p.vax_waived_until
    FROM public.booking_pets bp
    JOIN public.pets p ON p.id = bp.pet_id
    WHERE bp.booking_id = p_booking_id
  ),
  required_rules AS (
    SELECT r.vaccine_type, r.species::text AS species, COALESCE(r.grace_days, 0) AS grace_days
    FROM public.vaccination_rules r
    WHERE r.tenant_id = v_booking.tenant_id
      AND r.service_type::text = v_booking.service_type::text
      AND r.required = true
  ),
  latest_vax AS (
    SELECT DISTINCT ON (v.pet_id, v.vaccination_type)
      v.pet_id, v.vaccination_type, v.expiry_date, v.verified
    FROM public.vaccinations v
    ORDER BY v.pet_id, v.vaccination_type, v.administered_date DESC NULLS LAST
  )
  SELECT
    p.pet_id, p.pet_name, r.vaccine_type,
    CASE
      WHEN lv.pet_id IS NOT NULL
       AND lv.expiry_date IS NOT NULL
       AND lv.expiry_date >= (COALESCE(v_booking.start_date, now()::date) - (r.grace_days || ' days')::interval)::date
       AND lv.verified IS NOT false THEN 'ok'
      WHEN p.vax_waived_until IS NOT NULL
       AND p.vax_waived_until >= COALESCE(v_booking.start_date, now()::date) THEN 'waived'
      WHEN lv.pet_id IS NULL THEN 'missing'
      WHEN lv.expiry_date IS NULL THEN 'no_expiry'
      WHEN lv.expiry_date < (COALESCE(v_booking.start_date, now()::date) - (r.grace_days || ' days')::interval)::date THEN 'expired'
      WHEN lv.verified = false THEN 'unverified'
      ELSE 'ok'
    END AS status,
    COALESCE(lv.expiry_date, p.vax_waived_until)
  FROM pets_on_booking p
  CROSS JOIN required_rules r
  LEFT JOIN latest_vax lv ON lv.pet_id = p.pet_id AND lv.vaccination_type::text = r.vaccine_type::text
  WHERE (r.species = p.species OR r.species = 'any')
  ORDER BY p.pet_name, r.vaccine_type;
END;
$function$;

CREATE OR REPLACE FUNCTION public.hotel_can_confirm_booking(p_booking_id uuid)
 RETURNS TABLE(pet_id uuid, pet_name text, vaccine_type text, status text, expiry_date date)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings WHERE id = p_booking_id;
  IF v_booking.id IS NULL THEN RETURN; END IF;

  RETURN QUERY
  WITH pets_on_booking AS (
    SELECT p.id AS pet_id, p.name AS pet_name, p.species::text AS species,
           p.vax_waived_until
    FROM public.booking_pets bp
    JOIN public.pets p ON p.id = bp.pet_id
    WHERE bp.booking_id = p_booking_id
  ),
  required_rules AS (
    SELECT r.vaccine_type, r.species::text AS species, COALESCE(r.grace_days, 0) AS grace_days
    FROM public.vaccination_rules r
    WHERE r.tenant_id = v_booking.tenant_id
      AND r.service_type::text = v_booking.service_type::text
      AND r.required = true
  ),
  latest_vax AS (
    SELECT DISTINCT ON (v.pet_id, v.vaccination_type)
      v.pet_id, v.vaccination_type, v.expiry_date, v.verified
    FROM public.vaccinations v
    ORDER BY v.pet_id, v.vaccination_type, v.administered_date DESC NULLS LAST
  )
  SELECT
    p.pet_id, p.pet_name, r.vaccine_type,
    CASE
      WHEN lv.pet_id IS NOT NULL
       AND lv.expiry_date IS NOT NULL
       AND lv.expiry_date >= (COALESCE(v_booking.start_date, now()::date) - (r.grace_days || ' days')::interval)::date
       AND lv.verified IS NOT false THEN 'ok'
      WHEN p.vax_waived_until IS NOT NULL
       AND p.vax_waived_until >= COALESCE(v_booking.start_date, now()::date) THEN 'waived'
      WHEN lv.pet_id IS NULL THEN 'missing'
      WHEN lv.expiry_date IS NULL THEN 'no_expiry'
      WHEN lv.expiry_date < (COALESCE(v_booking.start_date, now()::date) - (r.grace_days || ' days')::interval)::date THEN 'expired'
      WHEN lv.verified = false THEN 'unverified'
      ELSE 'ok'
    END AS status,
    COALESCE(lv.expiry_date, p.vax_waived_until)
  FROM pets_on_booking p
  CROSS JOIN required_rules r
  LEFT JOIN latest_vax lv ON lv.pet_id = p.pet_id AND lv.vaccination_type::text = r.vaccine_type::text
  WHERE (r.species = p.species OR r.species = 'any')
  ORDER BY p.pet_name, r.vaccine_type;
END;
$function$;