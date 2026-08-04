CREATE OR REPLACE FUNCTION public.xero_reset_billing_data(target_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  counts jsonb := '{}'::jsonb;
  n bigint;
BEGIN
  IF NOT (public.is_platform_owner() OR public.user_has_permission(target_tenant_id, 'settings.xero.manage')) THEN
    RAISE EXCEPTION 'Not authorised to reset billing data';
  END IF;

  DELETE FROM public.payment_allocations pa
   USING public.payments p WHERE pa.payment_id = p.id AND p.tenant_id = target_tenant_id;
  DELETE FROM public.payment_refunds WHERE tenant_id = target_tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('refunds', n);

  DELETE FROM public.credit_note_applications ca
   USING public.credit_notes c WHERE ca.credit_note_id = c.id AND c.tenant_id = target_tenant_id;
  DELETE FROM public.credit_note_items ci
   USING public.credit_notes c WHERE ci.credit_note_id = c.id AND c.tenant_id = target_tenant_id;
  DELETE FROM public.credit_notes WHERE tenant_id = target_tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('credit_notes', n);

  DELETE FROM public.customer_credit_ledger WHERE tenant_id = target_tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('credit_ledger', n);

  DELETE FROM public.payments WHERE tenant_id = target_tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('payments', n);

  DELETE FROM public.invoice_events ie
   USING public.invoices i WHERE ie.invoice_id = i.id AND i.tenant_id = target_tenant_id;
  DELETE FROM public.invoice_items ii
   USING public.invoices i WHERE ii.invoice_id = i.id AND i.tenant_id = target_tenant_id;
  DELETE FROM public.invoices WHERE tenant_id = target_tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('invoices', n);

  DELETE FROM public.estimate_items ei
   USING public.estimates e WHERE ei.estimate_id = e.id AND e.tenant_id = target_tenant_id;
  DELETE FROM public.estimates WHERE tenant_id = target_tenant_id;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('estimates', n);

  DELETE FROM public.billing_runs WHERE tenant_id = target_tenant_id;

  DELETE FROM public.xero_sync_queue WHERE tenant_id = target_tenant_id;
  DELETE FROM public.xero_sync_log WHERE tenant_id = target_tenant_id;
  DELETE FROM public.xero_contacts_staging WHERE tenant_id = target_tenant_id;

  UPDATE public.customers SET xero_customer_id = NULL
   WHERE tenant_id = target_tenant_id AND xero_customer_id IS NOT NULL;
  GET DIAGNOSTICS n = ROW_COUNT; counts := counts || jsonb_build_object('customers_unlinked', n);

  INSERT INTO public.audit_log (tenant_id, actor_profile_id, action, entity_type, entity_id, meta)
  VALUES (target_tenant_id, public.current_profile_id(), 'xero.reset_billing_data', 'tenant', target_tenant_id, counts);

  RETURN counts;
END;
$$;

REVOKE ALL ON FUNCTION public.xero_reset_billing_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.xero_reset_billing_data(uuid) TO authenticated, service_role;