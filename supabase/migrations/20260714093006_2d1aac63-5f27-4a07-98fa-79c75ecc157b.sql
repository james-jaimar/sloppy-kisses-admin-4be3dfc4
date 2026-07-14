
-- Fix search_path on the last project-owned function missing it
CREATE OR REPLACE FUNCTION public.credit_note_items_set_line_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.line_total := round(coalesce(NEW.quantity,0) * coalesce(NEW.unit_price,0), 2);
  RETURN NEW;
END;
$$;

-- Revoke PUBLIC/anon EXECUTE on RPC-style SECURITY DEFINER functions,
-- then re-grant to only the roles that need them.
DO $$
DECLARE
  fn text;
  rpc_fns text[] := ARRAY[
    'public.user_has_permission(uuid,text)',
    'public.record_manual_refund(uuid,numeric,public.payment_method,text,uuid,text,date)',
    'public.void_refund(uuid)',
    'public.apply_credit_note(uuid,uuid,numeric)',
    'public.allocate_customer_credit(uuid,uuid,numeric,text)',
    'public.park_customer_credit(uuid,numeric,uuid,date,text)',
    'public.adjust_customer_credit(uuid,numeric,text)',
    'public.next_customer_number(uuid)',
    'public.next_pet_number(uuid)',
    'public.next_booking_number(uuid)',
    'public.next_invoice_number(uuid)',
    'public.next_credit_note_number(uuid)'
  ];
BEGIN
  FOREACH fn IN ARRAY rpc_fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn);
  END LOOP;
END $$;

-- get_public_invoice must remain callable by anon (public link).
REVOKE EXECUTE ON FUNCTION public.get_public_invoice(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_invoice(uuid) TO anon, authenticated;
