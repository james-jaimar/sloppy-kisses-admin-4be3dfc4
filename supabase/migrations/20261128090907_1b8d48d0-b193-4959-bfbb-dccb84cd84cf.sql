CREATE OR REPLACE FUNCTION public.grooming_sync_matted_surcharge() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE b public.bookings; i public.invoices; line_id uuid; pet_name text;
BEGIN
  SELECT * INTO b FROM public.bookings WHERE id=NEW.booking_id AND tenant_id=NEW.tenant_id;
  IF b.id IS NULL OR b.service_type NOT IN ('grooming_inhouse','grooming_mobile') OR b.invoice_id IS NULL OR b.parent_booking_id IS NOT NULL THEN RETURN NEW; END IF;
  SELECT * INTO i FROM public.invoices WHERE id=b.invoice_id AND tenant_id=b.tenant_id FOR UPDATE;
  IF i.id IS NULL OR i.status::text <> 'draft' OR NOT COALESCE(public._auto_invoice_enabled(b.tenant_id,'grooming'),true) THEN RETURN NEW; END IF;
  SELECT id INTO line_id FROM public.invoice_items WHERE invoice_id=i.id AND tenant_id=b.tenant_id AND booking_id=b.id AND (item_code='GROOM_MATTED' OR description='Matted coat surcharge' OR description LIKE 'Matted coat surcharge (%') ORDER BY sort_order LIMIT 1;
  IF COALESCE(NEW.matted_surcharge_zar,0)<=0 THEN
    DELETE FROM public.invoice_items WHERE id=line_id AND invoice_id=i.id AND booking_id=b.id;
  ELSE
    SELECT p.name INTO pet_name FROM public.booking_pets bp JOIN public.pets p ON p.id=bp.pet_id WHERE bp.booking_id=b.id LIMIT 1;
    IF line_id IS NOT NULL THEN
      UPDATE public.invoice_items SET unit_price=NEW.matted_surcharge_zar,quantity=1,discount_pct=0,item_code='GROOM_MATTED',description='Matted coat surcharge'||CASE WHEN pet_name IS NOT NULL THEN ' ('||pet_name||')' ELSE '' END WHERE id=line_id AND invoice_id=i.id AND booking_id=b.id;
    ELSE
      INSERT INTO public.invoice_items(tenant_id,invoice_id,booking_id,item_code,description,quantity,unit_price,sort_order) SELECT b.tenant_id,i.id,b.id,'GROOM_MATTED','Matted coat surcharge'||CASE WHEN pet_name IS NOT NULL THEN ' ('||pet_name||')' ELSE '' END,1,NEW.matted_surcharge_zar,COALESCE(MAX(sort_order),0)+1 FROM public.invoice_items WHERE invoice_id=i.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.grooming_sync_matted_surcharge() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.grooming_sync_matted_surcharge() TO service_role;
CREATE TRIGGER zz_grooming_matted_insert AFTER INSERT ON public.grooming_booking_details FOR EACH ROW EXECUTE FUNCTION public.grooming_sync_matted_surcharge();
CREATE TRIGGER zz_grooming_matted_update AFTER UPDATE OF matted_surcharge_zar ON public.grooming_booking_details FOR EACH ROW WHEN (OLD.matted_surcharge_zar IS DISTINCT FROM NEW.matted_surcharge_zar) EXECUTE FUNCTION public.grooming_sync_matted_surcharge();