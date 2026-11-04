CREATE OR REPLACE FUNCTION public.bookings_payment_gate() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE v_gated boolean; v_hours integer; BEGIN
 IF NEW.service_type IN ('grooming_inhouse','grooming_mobile') AND ((NEW.invoice_id IS NULL AND public.grooming_invoice_release_day(NEW.tenant_id,NEW.start_at)>(now() AT TIME ZONE 'Africa/Johannesburg')::date) OR EXISTS(SELECT 1 FROM public.invoices WHERE id=NEW.invoice_id AND status='draft' AND scheduled_release_date IS NOT NULL)) THEN NEW.payment_hold_expires_at:=NULL; RETURN NEW; END IF;
 IF NEW.status::text<>'confirmed' THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND OLD.status::text='confirmed' THEN RETURN NEW; END IF;
 IF COALESCE(NEW.deposit_waived,false) THEN RETURN NEW; END IF;
 IF NEW.service_type IN ('hotel_dog','hotel_cat') AND EXISTS(SELECT 1 FROM public.hotel_booking_reviews WHERE booking_id=NEW.id AND confirmed_at IS NOT NULL) THEN NEW.payment_hold_expires_at:=NULL; RETURN NEW; END IF;
 SELECT g.gated,g.hold_hours INTO v_gated,v_hours FROM public.booking_payment_gate(NEW.tenant_id,NEW.service_type::text) g;
 IF NOT COALESCE(v_gated,false) THEN RETURN NEW; END IF;
 IF public.booking_payment_satisfied(NEW.id) THEN NEW.payment_hold_expires_at:=NULL; RETURN NEW; END IF;
 NEW.status:='pending_payment'; NEW.payment_hold_expires_at:=COALESCE(NEW.payment_hold_expires_at,now()+make_interval(hours=>COALESCE(v_hours,48))); RETURN NEW;
 END $$;
CREATE OR REPLACE FUNCTION public.release_due_grooming_invoices() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r record; n integer:=0; BEGIN
 FOR r IN SELECT i.id,i.tenant_id,i.customer_id FROM public.invoices i WHERE i.status='draft' AND i.scheduled_release_date<=(now() AT TIME ZONE 'Africa/Johannesburg')::date ORDER BY i.scheduled_release_date LIMIT 500 FOR UPDATE SKIP LOCKED LOOP
 IF NOT EXISTS(SELECT 1 FROM public.bookings b WHERE b.invoice_id=r.id AND b.service_type IN ('grooming_inhouse','grooming_mobile') AND b.status NOT IN ('cancelled','no_show')) THEN CONTINUE; END IF;
 IF NOT COALESCE(public._auto_invoice_enabled(r.tenant_id,'grooming'),true) THEN CONTINUE; END IF;
 UPDATE public.invoices SET status='issued',scheduled_release_date=NULL WHERE id=r.id;
 INSERT INTO public.notification_events(tenant_id,customer_id,invoice_id,event_type,channel,status,payload) VALUES(r.tenant_id,r.customer_id,r.id,'invoice_issued','email','pending',jsonb_build_object('grooming_scheduled_release',true));
 UPDATE public.bookings b SET status=CASE WHEN NOT COALESCE(b.deposit_waived,false) AND COALESCE(g.gated,false) AND NOT public.booking_payment_satisfied(b.id) THEN 'pending_payment'::public.booking_status ELSE 'confirmed'::public.booking_status END,
 payment_hold_expires_at=CASE WHEN NOT COALESCE(b.deposit_waived,false) AND COALESCE(g.gated,false) AND NOT public.booking_payment_satisfied(b.id) THEN now()+make_interval(hours=>COALESCE(g.hold_hours,48)) ELSE NULL END
 FROM public.booking_payment_gate(r.tenant_id,'grooming_inhouse') g WHERE b.invoice_id=r.id AND b.status IN ('confirmed','pending_payment'); n:=n+1;
 END LOOP; RETURN n; END $$;
REVOKE ALL ON FUNCTION public.release_due_grooming_invoices() FROM PUBLIC,anon,authenticated; GRANT EXECUTE ON FUNCTION public.release_due_grooming_invoices() TO service_role;
DO $$ DECLARE d text; BEGIN SELECT pg_get_functiondef('public.ensure_booking_invoice_before_hotel_review(uuid)'::regprocedure) INTO d;
 d:=replace(d,'v_due:=GREATEST(v_issue,COALESCE((v_b.start_at AT TIME ZONE ''Africa/Johannesburg'')::date,v_issue));','v_due:=CASE WHEN (v_b.start_at AT TIME ZONE ''Africa/Johannesburg'')::date>(now() AT TIME ZONE ''Africa/Johannesburg'')::date THEN GREATEST(v_issue,(v_b.start_at AT TIME ZONE ''Africa/Johannesburg'')::date) ELSE v_issue+v_terms END;'); EXECUTE d; END $$;