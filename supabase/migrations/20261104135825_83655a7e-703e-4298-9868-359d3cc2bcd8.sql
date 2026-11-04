CREATE OR REPLACE FUNCTION public.align_grooming_payment_hold() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE i public.invoices; h integer; BEGIN
 IF NEW.service_type NOT IN ('grooming_inhouse','grooming_mobile') OR NEW.invoice_id IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO i FROM public.invoices WHERE id=NEW.invoice_id AND tenant_id=NEW.tenant_id;
 IF i.status='draft' AND i.scheduled_release_date IS NOT NULL THEN NEW.payment_hold_expires_at:=NULL; RETURN NEW; END IF;
 IF NEW.status='pending_payment' AND NOT COALESCE(NEW.deposit_waived,false) THEN
 SELECT hold_hours INTO h FROM public.booking_payment_gate(NEW.tenant_id,NEW.service_type::text);
 NEW.payment_hold_expires_at:=GREATEST(COALESCE(NEW.payment_hold_expires_at,now()+make_interval(hours=>COALESCE(h,48))),COALESCE(i.due_date::timestamp AT TIME ZONE 'Africa/Johannesburg',now())+make_interval(hours=>COALESCE(h,48)));
 END IF; RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.align_grooming_payment_hold() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER zz_align_grooming_payment_hold BEFORE UPDATE OF invoice_id,status,payment_hold_expires_at ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.align_grooming_payment_hold();
CREATE OR REPLACE FUNCTION public.reschedule_grooming_invoice_release() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE rd date; due date; BEGIN
 IF NEW.service_type NOT IN ('grooming_inhouse','grooming_mobile') OR NEW.invoice_id IS NULL OR (NEW.start_at IS NOT DISTINCT FROM OLD.start_at AND NEW.status IS NOT DISTINCT FROM OLD.status) THEN RETURN NEW; END IF;
 SELECT MIN(public.grooming_invoice_release_day(b.tenant_id,b.start_at)),MIN((b.start_at AT TIME ZONE 'Africa/Johannesburg')::date) INTO rd,due FROM public.bookings b WHERE b.invoice_id=NEW.invoice_id AND b.status NOT IN ('cancelled','no_show');
 IF rd IS NOT NULL THEN UPDATE public.invoices SET scheduled_release_date=rd,issue_date=GREATEST(rd,(now() AT TIME ZONE 'Africa/Johannesburg')::date),due_date=GREATEST(rd,due) WHERE id=NEW.invoice_id AND status='draft' AND scheduled_release_date IS NOT NULL; END IF;
 RETURN NEW; END $$;
DROP TRIGGER reschedule_grooming_invoice_release ON public.bookings;
CREATE TRIGGER reschedule_grooming_invoice_release AFTER UPDATE OF start_at,status ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.reschedule_grooming_invoice_release();