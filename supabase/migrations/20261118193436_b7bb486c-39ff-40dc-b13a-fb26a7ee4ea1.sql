ALTER TABLE public.xero_settings ADD COLUMN sync_payments boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.xero_enqueue(_tenant_id uuid, _entity_type text, _entity_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.xero_settings s WHERE s.tenant_id = _tenant_id AND s.enabled AND s.auto_push AND (_entity_type <> 'payment' OR s.sync_payments)) THEN RETURN; END IF;
  INSERT INTO public.xero_sync_queue (tenant_id, entity_type, entity_id, status, run_after, attempts, last_error)
  VALUES (_tenant_id, _entity_type, _entity_id, 'pending', now(), 0, NULL)
  ON CONFLICT (tenant_id, entity_type, entity_id) DO UPDATE SET status='pending', run_after=now(), attempts=0, last_error=NULL, updated_at=now();
END; $$;
REVOKE ALL ON FUNCTION public.xero_enqueue(uuid,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.xero_enqueue(uuid,text,uuid) TO service_role;

WITH retired AS (
 UPDATE public.xero_sync_queue q SET status='done',updated_at=now()
 FROM public.xero_settings s WHERE q.tenant_id=s.tenant_id AND NOT s.sync_payments AND q.entity_type='payment' AND q.status IN ('pending','failed')
 RETURNING q.tenant_id,q.entity_id,q.last_error
)
INSERT INTO public.xero_sync_log (tenant_id,entity_type,entity_id,action,status,error_message)
SELECT tenant_id,'payment',entity_id,'skip','skipped','Payment syncing disabled; bank reconciliation stays in Xero.' || CASE WHEN last_error IS NOT NULL THEN ' Previous error: ' || last_error ELSE '' END FROM retired;

CREATE OR REPLACE FUNCTION public.xero_settings_payment_sync_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
 IF OLD.sync_payments IS DISTINCT FROM NEW.sync_payments THEN
  INSERT INTO public.audit_log (tenant_id,actor_profile_id,action,table_name,record_id,before,after)
  VALUES (NEW.tenant_id,public.current_profile_id(),'update','xero_settings',NEW.id,jsonb_build_object('sync_payments',OLD.sync_payments),jsonb_build_object('sync_payments',NEW.sync_payments));
  IF NOT NEW.sync_payments THEN
   WITH retired AS (
    UPDATE public.xero_sync_queue SET status='done',updated_at=now()
    WHERE tenant_id=NEW.tenant_id AND entity_type='payment' AND status IN ('pending','failed') RETURNING entity_id,last_error
   )
   INSERT INTO public.xero_sync_log (tenant_id,entity_type,entity_id,action,status,error_message)
   SELECT NEW.tenant_id,'payment',entity_id,'skip','skipped','Payment syncing disabled; bank reconciliation stays in Xero.' || CASE WHEN last_error IS NOT NULL THEN ' Previous error: ' || last_error ELSE '' END FROM retired;
  END IF;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.xero_settings_payment_sync_changed() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER xero_settings_payment_sync_changed AFTER UPDATE OF sync_payments ON public.xero_settings FOR EACH ROW EXECUTE FUNCTION public.xero_settings_payment_sync_changed();