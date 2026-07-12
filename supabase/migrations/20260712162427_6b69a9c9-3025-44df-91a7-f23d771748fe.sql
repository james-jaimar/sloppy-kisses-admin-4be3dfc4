-- Helper: is a given provider enabled for this tenant? Runs as owner, safe to call from public paths (returns boolean only).
CREATE OR REPLACE FUNCTION public.tenant_gateway_enabled(target_tenant_id uuid, target_provider text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payment_providers
    WHERE tenant_id = target_tenant_id
      AND provider = target_provider
      AND enabled = true
  );
$$;

GRANT EXECUTE ON FUNCTION public.tenant_gateway_enabled(uuid, text) TO anon, authenticated, service_role;

-- Extend the public-invoice payload with a payfast_enabled flag so the pay page can show/hide the button.
CREATE OR REPLACE FUNCTION public.get_public_invoice(p_token uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.invoices;
  v_customer jsonb;
  v_items jsonb;
  v_tenant jsonb;
  v_settings jsonb;
  v_first boolean;
  v_payfast boolean;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE public_view_token = p_token LIMIT 1;
  IF v_inv.id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_inv.status = 'draft' THEN
    RETURN NULL;
  END IF;

  v_first := v_inv.viewed_at IS NULL;

  UPDATE public.invoices
     SET viewed_at = COALESCE(viewed_at, now())
   WHERE id = v_inv.id;

  IF v_first THEN
    INSERT INTO public.invoice_events(tenant_id, invoice_id, event_type, actor_label, payload)
    VALUES (v_inv.tenant_id, v_inv.id, 'viewed', 'Customer (public link)',
      jsonb_build_object('first_view', true));
  END IF;

  SELECT to_jsonb(c) INTO v_customer FROM (
    SELECT id, full_name, email, mobile, customer_number,
      address_line_1, address_line_2, suburb, city, province, postcode
    FROM public.customers WHERE id = v_inv.customer_id
  ) c;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.sort_order, i.created_at), '[]'::jsonb) INTO v_items
  FROM (
    SELECT id, description, quantity, unit_price, line_total, sort_order, created_at
    FROM public.invoice_items WHERE invoice_id = v_inv.id
  ) i;

  SELECT to_jsonb(t) INTO v_tenant FROM (
    SELECT id, name, primary_colour, logo_url, contact_email, contact_phone
    FROM public.tenants WHERE id = v_inv.tenant_id
  ) t;

  SELECT to_jsonb(s) INTO v_settings FROM (
    SELECT company_name, vat_number, address, banking_details, footer_notes
    FROM public.invoicing_settings WHERE tenant_id = v_inv.tenant_id
  ) s;

  v_payfast := public.tenant_gateway_enabled(v_inv.tenant_id, 'payfast');

  RETURN jsonb_build_object(
    'invoice', to_jsonb(v_inv) - 'public_view_token',
    'customer', v_customer,
    'items', v_items,
    'tenant', v_tenant,
    'settings', v_settings,
    'payfast_enabled', v_payfast
  );
END;
$function$;