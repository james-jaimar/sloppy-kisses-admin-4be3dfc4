ALTER TABLE public.retail_settings ADD COLUMN IF NOT EXISTS auto_email_paid_receipt boolean NOT NULL DEFAULT true;
CREATE OR REPLACE FUNCTION public.queue_pos_paid_receipt() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text; v_notify boolean;
BEGIN
 IF NEW.status <> 'paid' OR OLD.status = 'paid' OR NEW.balance_due > 0 OR NEW.amount_paid <= 0 THEN RETURN NEW; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.stock_movements sm WHERE sm.tenant_id=NEW.tenant_id AND sm.ref_type='invoice' AND sm.ref_id=NEW.id AND sm.reason='sale') THEN RETURN NEW; END IF;
 IF NOT coalesce((SELECT rs.auto_email_paid_receipt FROM public.retail_settings rs WHERE rs.tenant_id=NEW.tenant_id),true) THEN RETURN NEW; END IF;
 SELECT c.email,c.notify_email INTO v_email,v_notify FROM public.customers c WHERE c.id=NEW.customer_id AND c.tenant_id=NEW.tenant_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('pos-receipt:' || NEW.id::text,0));
 IF NOT EXISTS (SELECT 1 FROM public.notification_events e WHERE e.tenant_id=NEW.tenant_id AND e.invoice_id=NEW.id AND e.event_type='invoice_paid' AND e.channel='email') THEN
 INSERT INTO public.notification_events(tenant_id,event_type,channel,invoice_id,customer_id,recipient_email,payload,status,error)
 VALUES(NEW.tenant_id,'invoice_paid','email',NEW.id,NEW.customer_id,v_email,jsonb_build_object('pos_paid_receipt',true),
 CASE WHEN v_notify IS FALSE OR nullif(btrim(v_email),'') IS NULL THEN 'skipped'::public.notification_status ELSE 'pending'::public.notification_status END,
 CASE WHEN v_notify IS FALSE THEN 'Opted out (email)' WHEN nullif(btrim(v_email),'') IS NULL THEN 'No email address' ELSE NULL END);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.queue_pos_paid_receipt() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER invoices_queue_pos_receipt AFTER UPDATE OF status ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.queue_pos_paid_receipt();