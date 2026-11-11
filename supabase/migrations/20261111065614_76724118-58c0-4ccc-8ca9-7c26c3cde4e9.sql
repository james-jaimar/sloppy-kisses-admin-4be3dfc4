CREATE OR REPLACE FUNCTION public.guard_pos_receipt_setting() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF auth.uid() IS NOT NULL AND ((TG_OP='UPDATE' AND NEW.auto_email_paid_receipt IS DISTINCT FROM OLD.auto_email_paid_receipt) OR (TG_OP='INSERT' AND NEW.auto_email_paid_receipt IS FALSE)) AND NOT public.user_has_permission(NEW.tenant_id,'settings.manage') THEN
 RAISE EXCEPTION 'Settings management permission is required to change automatic receipts' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.guard_pos_receipt_setting() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER retail_guard_pos_receipt_setting BEFORE INSERT OR UPDATE ON public.retail_settings FOR EACH ROW EXECUTE FUNCTION public.guard_pos_receipt_setting();