CREATE OR REPLACE FUNCTION public.xero_drain_queue()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT s.tenant_id
    FROM public.xero_settings s
    WHERE s.enabled AND s.auto_push AND s.xero_tenant_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.xero_sync_queue q
        WHERE q.tenant_id = s.tenant_id AND q.status = 'pending' AND q.run_after <= now()
      )
  LOOP
    PERFORM net.http_post(
      url := 'https://jsmsyezkfxtgmxvgfuxx.supabase.co/functions/v1/xero-sync',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', '23e818bf93a45d49cabdd7500c0f3ff9c7523981a3f33300'
      ),
      body := jsonb_build_object('action', 'run_queue', 'tenant_id', t.tenant_id, 'limit', 5)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.xero_drain_queue() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.xero_drain_queue() TO service_role;

SELECT cron.unschedule('xero-drain-queue')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'xero-drain-queue');

SELECT cron.schedule('xero-drain-queue', '*/5 * * * *', $cron$SELECT public.xero_drain_queue();$cron$);