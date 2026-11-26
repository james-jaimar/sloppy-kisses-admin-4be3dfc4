INSERT INTO public.grooming_addons (tenant_id, code, name, price_zar, kind, active, sort_order, duration_minutes, bookable_standalone)
VALUES ('75cc6a9e-9d17-4268-92ee-8b595c842dee', 'deshed_only', 'De-shed only', 150, 'fixed', true, 55, 20, true)
ON CONFLICT (tenant_id, code) DO NOTHING;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.grooming_addons WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee' AND code='deshed_only' AND price_zar=150 AND active AND bookable_standalone) THEN
    RAISE EXCEPTION 'De-shed only must be active, standalone and priced at R150';
  END IF;
END $$;