-- Invoice items: customer can read items for their own invoices
CREATE POLICY invoice_items_customer_select_own ON public.invoice_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND i.customer_id = public.current_customer_id(i.tenant_id)
    )
  );

-- Vaccinations: customer can insert/update/delete for their own pets
CREATE POLICY vaccinations_customer_insert_own ON public.vaccinations
  FOR INSERT
  WITH CHECK (public.user_can_access_pet(tenant_id, pet_id));

CREATE POLICY vaccinations_customer_update_own ON public.vaccinations
  FOR UPDATE
  USING (public.user_can_access_pet(tenant_id, pet_id))
  WITH CHECK (public.user_can_access_pet(tenant_id, pet_id));

CREATE POLICY vaccinations_customer_delete_own ON public.vaccinations
  FOR DELETE
  USING (public.user_can_access_pet(tenant_id, pet_id));

-- Notification events: customer can read events addressed to them
CREATE POLICY notification_events_customer_select_own ON public.notification_events
  FOR SELECT
  USING (customer_id = public.current_customer_id(tenant_id));

-- Booking requests: add kind + related_booking_id for change/cancel flows
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname='public' AND t.typname='booking_request_kind'
  ) THEN
    CREATE TYPE public.booking_request_kind AS ENUM ('new','change','cancel');
  END IF;
END$$;

ALTER TABLE public.booking_requests
  ADD COLUMN IF NOT EXISTS kind public.booking_request_kind NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS related_booking_id uuid REFERENCES public.bookings(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS booking_requests_related_booking_idx
  ON public.booking_requests(related_booking_id)
  WHERE related_booking_id IS NOT NULL;