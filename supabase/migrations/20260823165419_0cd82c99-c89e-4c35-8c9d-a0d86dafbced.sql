ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS hold_expires_at timestamptz;
ALTER TABLE public.estimates ADD COLUMN IF NOT EXISTS created_via text;

ALTER TABLE public.hotel_workflow_settings
  ADD COLUMN IF NOT EXISTS portal_quotes_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS portal_quote_hold_hours integer NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS portal_quote_max_active integer NOT NULL DEFAULT 3;

CREATE OR REPLACE FUNCTION public.hotel_pencilled_by_day(
  p_tenant_id uuid, p_start date, p_end date, p_exclude_estimate_id uuid DEFAULT NULL
) RETURNS TABLE(day date, accommodation_type text, pets integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH days AS (
    SELECT generate_series(p_start, GREATEST(p_start, p_end - 1), interval '1 day')::date AS d
  ),
  held AS (
    SELECT e.accommodation_type,
           (e.start_at AT TIME ZONE 'Africa/Johannesburg')::date AS s,
           COALESCE((e.end_at AT TIME ZONE 'Africa/Johannesburg')::date,
                    (e.start_at AT TIME ZONE 'Africa/Johannesburg')::date + 1) AS e_date,
           GREATEST(1, COALESCE(array_length(e.pet_ids, 1), 1))::int AS pet_count
      FROM public.estimates e
     WHERE e.tenant_id = p_tenant_id
       AND e.status = 'sent'
       AND e.booking_id IS NULL
       AND e.accommodation_type IS NOT NULL
       AND e.start_at IS NOT NULL
       AND (
         CASE WHEN e.hold_expires_at IS NOT NULL
              THEN e.hold_expires_at > now()
              ELSE COALESCE(e.hold_until, e.expiry_date, CURRENT_DATE) >= CURRENT_DATE
         END
       )
       AND (p_exclude_estimate_id IS NULL OR e.id <> p_exclude_estimate_id)
  )
  SELECT days.d, h.accommodation_type, sum(h.pet_count)::int
    FROM days JOIN held h ON days.d >= h.s AND days.d < h.e_date
   WHERE public.user_has_tenant_access(p_tenant_id)
   GROUP BY days.d, h.accommodation_type
   ORDER BY days.d;
$$;

GRANT EXECUTE ON FUNCTION public.hotel_pencilled_by_day(uuid, date, date, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.expire_quote_holds()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_count integer;
BEGIN
  UPDATE public.estimates
     SET status = 'expired', updated_at = now()
   WHERE status = 'sent'
     AND booking_id IS NULL
     AND (
       CASE WHEN hold_expires_at IS NOT NULL
            THEN hold_expires_at <= now()
            ELSE COALESCE(hold_until, expiry_date) IS NOT NULL
                 AND COALESCE(hold_until, expiry_date) < CURRENT_DATE
       END
     );
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;

REVOKE ALL ON FUNCTION public.expire_quote_holds() FROM public;
GRANT EXECUTE ON FUNCTION public.expire_quote_holds() TO service_role;

SELECT cron.unschedule('expire-quote-holds-daily')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-quote-holds-daily');

SELECT cron.unschedule('expire-quote-holds-hourly')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-quote-holds-hourly');

SELECT cron.schedule('expire-quote-holds-hourly', '15 * * * *',
  $cron$SELECT public.expire_quote_holds();$cron$);