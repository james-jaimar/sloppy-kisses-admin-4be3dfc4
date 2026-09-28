CREATE OR REPLACE FUNCTION public.preview_monthly_daycare_breakdown(p_tenant_id uuid, p_period_start date)
RETURNS TABLE(enrolment_id uuid, customer_id uuid, customer_name text, customer_email text, pet_name text, plan_name text, end_date date, amount numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_pe date;
BEGIN
  IF NOT public.user_has_permission(p_tenant_id, 'invoicing.run_monthly') AND NOT public.is_platform_owner() THEN
    RAISE EXCEPTION 'Missing permission invoicing.run_monthly';
  END IF;
  v_pe := (date_trunc('month', p_period_start) + INTERVAL '1 month - 1 day')::date;
  RETURN QUERY
  SELECT e.id, e.customer_id, c.full_name::text, c.email::text, pt.name::text, dp.name::text, e.end_date,
    (CASE WHEN e.end_date IS NOT NULL AND e.end_date < v_pe
      THEN ROUND(COALESCE(dp.price,0) * public._daycare_count_days(p_period_start, e.end_date, e.selected_days)
           / NULLIF(public._daycare_count_days(p_period_start, v_pe, e.selected_days),0), 2)
      ELSE COALESCE(dp.price,0) END)::numeric
  FROM public.daycare_enrolments e
  LEFT JOIN public.daycare_plans dp ON dp.id = e.daycare_plan_id
  LEFT JOIN public.customers c ON c.id = e.customer_id
  LEFT JOIN public.pets pt ON pt.id = e.pet_id
  WHERE e.tenant_id = p_tenant_id AND COALESCE(e.active, true)
    AND COALESCE(e.start_date, p_period_start) <= v_pe
    AND (e.end_date IS NULL OR e.end_date >= p_period_start)
    AND NOT (e.paused_from IS NOT NULL AND e.paused_from <= p_period_start
             AND COALESCE(e.paused_to, DATE '9999-12-31') >= v_pe)
    AND NOT EXISTS (SELECT 1 FROM public.invoice_items ii JOIN public.invoices inv ON inv.id = ii.invoice_id
      WHERE ii.source_type = 'daycare_enrolment_prorata' AND ii.source_id = e.id
        AND inv.billing_period_end BETWEEN p_period_start AND v_pe)
  ORDER BY c.full_name, pt.name;
END $$;
REVOKE ALL ON FUNCTION public.preview_monthly_daycare_breakdown(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_monthly_daycare_breakdown(uuid, date) TO authenticated;