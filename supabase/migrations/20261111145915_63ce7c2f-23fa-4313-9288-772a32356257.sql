INSERT INTO public.message_templates (tenant_id, event_code, channel, name, subject, body)
SELECT t.tenant_id, 'hotel_quote_accepted', 'email', 'Hotel quote accepted',
 'Thanks — quote accepted for hotel stay {{booking.booking_number}}',
 E'Hi {{customer.first_name}},\n\nThank you for accepting your quote for {{pet.name}}''s hotel stay {{booking.booking_number}}.\n\nOur team will be in touch shortly to gather the remaining details (vet, emergency contact, care notes and vaccinations). You can also complete these in your customer portal:\n{{booking.portal_url}}\n\nOnce staff confirms your stay, we will send the tax invoice with the applicable payment amount and dates.\n\n{{tenant.name}}'
FROM (SELECT DISTINCT tenant_id FROM public.message_templates WHERE event_code='hotel_booking_requested') t
WHERE NOT EXISTS (SELECT 1 FROM public.message_templates m WHERE m.tenant_id=t.tenant_id AND m.event_code='hotel_quote_accepted' AND m.channel='email');

CREATE OR REPLACE FUNCTION public.trg_hotel_quote_accepted_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE b record;
BEGIN
  IF NEW.status::text <> 'accepted' OR OLD.status::text = 'accepted' OR NEW.booking_id IS NULL THEN RETURN NEW; END IF;
  SELECT id, tenant_id, customer_id, service_type INTO b FROM public.bookings WHERE id = NEW.booking_id;
  IF b.id IS NULL OR b.service_type::text NOT IN ('hotel_dog','hotel_cat') THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.notification_events WHERE booking_id=b.id AND event_type='booking_created' AND payload->>'quote_accepted'='true') THEN RETURN NEW; END IF;
  INSERT INTO public.notification_events (tenant_id, event_type, booking_id, customer_id, payload)
  VALUES (b.tenant_id, 'booking_created', b.id, COALESCE(NEW.customer_id, b.customer_id),
          jsonb_build_object('quote_accepted', true, 'estimate_id', NEW.id));
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.trg_hotel_quote_accepted_notify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_estimates_hotel_quote_accepted ON public.estimates;
CREATE TRIGGER trg_estimates_hotel_quote_accepted AFTER UPDATE OF status ON public.estimates
FOR EACH ROW EXECUTE FUNCTION public.trg_hotel_quote_accepted_notify();