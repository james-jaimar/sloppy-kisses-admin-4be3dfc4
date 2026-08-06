CREATE OR REPLACE FUNCTION public.portal_payment_options(p_invoice_id uuid)
RETURNS TABLE (payfast_enabled boolean, mode text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
BEGIN
  SELECT i.tenant_id INTO v_tenant
  FROM public.invoices i
  JOIN public.customers c ON c.id = i.customer_id
  JOIN public.profiles p ON p.id = c.linked_profile_id
  WHERE i.id = p_invoice_id
    AND p.auth_user_id = auth.uid()
    AND c.portal_access_enabled = true;

  IF v_tenant IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT COALESCE(pp.enabled, false), COALESCE(pp.mode::text, 'test')
  FROM public.payment_providers pp
  WHERE pp.tenant_id = v_tenant AND pp.provider = 'payfast';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.portal_payment_options(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.portal_payment_options(uuid) TO authenticated;