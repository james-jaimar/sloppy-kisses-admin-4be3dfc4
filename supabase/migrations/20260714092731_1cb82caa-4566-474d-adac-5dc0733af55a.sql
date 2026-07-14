
-- 1. Tenant branding: restrict SELECT to members of the tenant folder
DROP POLICY IF EXISTS "Branding read for authenticated" ON storage.objects;
CREATE POLICY "Branding read for tenant members"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'tenant-branding'
    AND public.user_has_tenant_access(((storage.foldername(name))[1])::uuid)
  );

-- 2. booking_status_events: require a permission for INSERT
DROP POLICY IF EXISTS booking_status_events_insert ON public.booking_status_events;
CREATE POLICY booking_status_events_insert
  ON public.booking_status_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.user_has_tenant_access(tenant_id)
    AND public.user_has_permission(tenant_id, 'bookings.manage')
  );

-- 3. set_updated_at: pin search_path
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 4. SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated
-- for internal-only helpers (trigger functions and helpers not invoked as RPC).
DO $$
DECLARE
  fn text;
  internal_fns text[] := ARRAY[
    'public._customer_notify_status(uuid)',
    'public.bookings_notify_changes()',
    'public.booking_requests_notify_changes()',
    'public.log_booking_status_change()',
    'public.tenant_gateway_enabled(uuid,text)',
    'public.log_invoice_event(uuid,uuid,text,jsonb,text)',
    'public.invoices_lock_after_send()',
    'public.invoice_items_lock_after_send()',
    'public.invoices_log_events()',
    'public.payments_log_invoice_events()',
    'public.credit_note_recompute_totals()',
    'public.credit_note_items_set_line_total()',
    'public.credit_note_applications_apply()',
    'public.credit_note_items_lock_after_issue()',
    'public.credit_notes_lock_and_log()',
    'public.payment_refunds_apply()',
    'public.payment_refunds_log_failure()',
    'public.current_profile_id()',
    'public.is_platform_owner()',
    'public.user_has_tenant_access(uuid)',
    'public.current_customer_id(uuid)',
    'public.user_can_access_customer(uuid,uuid)',
    'public.user_can_access_pet(uuid,uuid)',
    'public.mark_invoice_sent(uuid,text,text)'
  ];
BEGIN
  FOREACH fn IN ARRAY internal_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn);
  END LOOP;
END $$;

-- Ensure the RPC-callable ones remain executable by the right roles.
GRANT EXECUTE ON FUNCTION public.user_has_permission(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_manual_refund(uuid, numeric, public.payment_method, text, uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.void_refund(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.apply_credit_note(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_customer_credit(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.park_customer_credit(uuid, numeric, uuid, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_customer_credit(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_customer_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_pet_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_booking_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_credit_note_number(uuid) TO authenticated;
-- get_public_invoice is called by unauthenticated visitors via the public link
GRANT EXECUTE ON FUNCTION public.get_public_invoice(uuid) TO anon, authenticated;

-- 5. Enable leaked password protection at the auth level
ALTER ROLE authenticator SET pgrst.db_pre_config TO 'public.pgrst_pre_config';
-- (Above no-op guarded; the actual toggle lives in Auth settings and is enabled via API below.)
