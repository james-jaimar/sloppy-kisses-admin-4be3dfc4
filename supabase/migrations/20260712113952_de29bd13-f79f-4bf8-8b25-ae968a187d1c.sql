
-- B1: Email delivery for invoices
-- 1) Track send/view state on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS send_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS public_view_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS invoices_public_view_token_key ON public.invoices(public_view_token);

-- 2) Anon-callable RPC to fetch + log view for a public share link.
CREATE OR REPLACE FUNCTION public.get_public_invoice(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices;
  v_customer jsonb;
  v_items jsonb;
  v_tenant jsonb;
  v_settings jsonb;
  v_first boolean;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE public_view_token = p_token LIMIT 1;
  IF v_inv.id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Only expose invoices that have been issued (never drafts / voided drafts).
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

  RETURN jsonb_build_object(
    'invoice', to_jsonb(v_inv) - 'public_view_token',
    'customer', v_customer,
    'items', v_items,
    'tenant', v_tenant,
    'settings', v_settings
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_invoice(uuid) TO anon, authenticated;

-- 3) Service-role-only helper for the send-invoice-email function to
-- atomically bump send_count / sent_at and log the event.
CREATE OR REPLACE FUNCTION public.mark_invoice_sent(p_invoice_id uuid, p_recipient text, p_kind text DEFAULT 'send')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_inv public.invoices;
BEGIN
  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'invoice not found'; END IF;

  UPDATE public.invoices
    SET sent_at = COALESCE(sent_at, now()),
        last_sent_at = now(),
        send_count = send_count + 1
    WHERE id = p_invoice_id;

  INSERT INTO public.invoice_events(tenant_id, invoice_id, event_type, actor_label, payload)
  VALUES (v_inv.tenant_id, v_inv.id,
    CASE WHEN p_kind = 'reminder' THEN 'reminder_sent' ELSE 'sent' END,
    'System',
    jsonb_build_object('recipient', p_recipient, 'send_count', v_inv.send_count + 1));
END;
$$;

REVOKE ALL ON FUNCTION public.mark_invoice_sent(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_invoice_sent(uuid, text, text) TO service_role;
