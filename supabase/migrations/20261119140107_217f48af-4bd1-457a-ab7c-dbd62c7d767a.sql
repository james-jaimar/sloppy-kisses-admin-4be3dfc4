CREATE OR REPLACE FUNCTION public.stamp_actor_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _pid uuid := public.current_profile_id();
BEGIN
  IF TG_TABLE_NAME = 'payments' THEN
    IF TG_OP = 'INSERT' THEN NEW.recorded_by := COALESCE(NEW.recorded_by, _pid); END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, _pid);
    NEW.updated_by := COALESCE(NEW.updated_by, NEW.created_by);
  ELSIF _pid IS NOT NULL THEN
    NEW.updated_by := _pid;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.stamp_actor_columns() FROM PUBLIC, anon, authenticated;
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['bookings','invoices','estimates','credit_notes','payments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS stamp_actor_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER stamp_actor_%1$s BEFORE INSERT OR UPDATE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.stamp_actor_columns()', t);
  END LOOP;
END $$;