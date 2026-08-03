CREATE TABLE public.closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  services text[] NOT NULL DEFAULT '{}',
  bill_anyway boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT closures_dates_valid CHECK (end_date >= start_date)
);

GRANT SELECT ON public.closures TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.closures TO authenticated;
GRANT ALL ON public.closures TO service_role;

ALTER TABLE public.closures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "closures_select" ON public.closures FOR SELECT TO authenticated
  USING (public.user_has_tenant_access(tenant_id) OR public.current_customer_id(tenant_id) IS NOT NULL);
CREATE POLICY "closures_insert" ON public.closures FOR INSERT TO authenticated
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.policies.manage'));
CREATE POLICY "closures_update" ON public.closures FOR UPDATE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.policies.manage'))
  WITH CHECK (public.user_has_permission(tenant_id, 'settings.policies.manage'));
CREATE POLICY "closures_delete" ON public.closures FOR DELETE TO authenticated
  USING (public.user_has_permission(tenant_id, 'settings.policies.manage'));

CREATE INDEX closures_tenant_range_idx ON public.closures (tenant_id, start_date, end_date);

CREATE TRIGGER set_closures_updated_at BEFORE UPDATE ON public.closures
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Is the business closed on this date for this service?
CREATE OR REPLACE FUNCTION public.is_closed(p_tenant_id uuid, p_date date, p_service text DEFAULT NULL, p_billable_only boolean DEFAULT false)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.closures c
    WHERE c.tenant_id = p_tenant_id
      AND p_date BETWEEN c.start_date AND c.end_date
      AND (cardinality(c.services) = 0 OR p_service IS NULL OR p_service = ANY (c.services))
      AND (p_billable_only = false OR c.bill_anyway = false)
  );
$$;

REVOKE ALL ON FUNCTION public.is_closed(uuid, date, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_closed(uuid, date, text, boolean) TO authenticated, service_role;

-- Pro-rata now skips non-billable closure days on both sides of the fraction.
CREATE OR REPLACE FUNCTION public.daycare_prorata_quote(p_enrolment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  e public.daycare_enrolments;
  v_price numeric(12,2);
  v_plan text;
  v_ms date;
  v_me date;
  v_days text[];
  v_total int;
  v_billed int;
  v_closed int;
  v_amount numeric(12,2);
BEGIN
  SELECT * INTO e FROM public.daycare_enrolments WHERE id = p_enrolment_id;
  IF e.id IS NULL OR e.start_date IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(dp.price,0), dp.name INTO v_price, v_plan
  FROM public.daycare_plans dp WHERE dp.id = e.daycare_plan_id;
  v_price := COALESCE(v_price, 0);

  v_ms := date_trunc('month', e.start_date)::date;
  v_me := (v_ms + INTERVAL '1 month - 1 day')::date;
  IF e.end_date IS NOT NULL AND e.end_date < v_me THEN v_me := e.end_date; END IF;

  v_days := COALESCE(e.selected_days, ARRAY['mon','tue','wed','thu','fri']::text[]);

  SELECT count(*) INTO v_total
  FROM generate_series(v_ms, (date_trunc('month', e.start_date) + INTERVAL '1 month - 1 day')::date, INTERVAL '1 day') d
  WHERE lower(to_char(d, 'Dy')) = ANY (v_days)
    AND NOT public.is_closed(e.tenant_id, d::date, 'daycare', true);

  SELECT count(*) INTO v_billed
  FROM generate_series(e.start_date, v_me, INTERVAL '1 day') d
  WHERE lower(to_char(d, 'Dy')) = ANY (v_days)
    AND NOT public.is_closed(e.tenant_id, d::date, 'daycare', true);

  SELECT count(*) INTO v_closed
  FROM generate_series(e.start_date, v_me, INTERVAL '1 day') d
  WHERE lower(to_char(d, 'Dy')) = ANY (v_days)
    AND public.is_closed(e.tenant_id, d::date, 'daycare', true);

  IF COALESCE(v_total,0) = 0 THEN RETURN NULL; END IF;

  v_amount := ROUND(v_price * v_billed::numeric / v_total::numeric, 2);

  RETURN jsonb_build_object(
    'enrolment_id', e.id,
    'plan_name', v_plan,
    'plan_price', v_price,
    'days_total', v_total,
    'days_billed', v_billed,
    'days_closed', COALESCE(v_closed,0),
    'amount', v_amount,
    'period_start', e.start_date,
    'period_end', v_me,
    'is_partial', e.start_date <> v_ms
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.daycare_prorata_quote(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.daycare_prorata_quote(uuid) TO authenticated, service_role;