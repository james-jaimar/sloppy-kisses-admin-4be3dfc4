CREATE OR REPLACE FUNCTION public.next_estimate_number(target_tenant_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_prefix text; v_next integer; v_num text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(target_tenant_id::text || ':estimate_number'));
  INSERT INTO public.invoicing_settings (tenant_id) VALUES (target_tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
  LOOP
    UPDATE public.invoicing_settings SET next_estimate_number = next_estimate_number + 1
     WHERE tenant_id = target_tenant_id
     RETURNING COALESCE(estimate_prefix,'QU-'), next_estimate_number - 1 INTO v_prefix, v_next;
    -- Xero-style unpadded numbers (QU-4882); skip any number already used locally.
    v_num := v_prefix || v_next::text;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.estimates WHERE tenant_id = target_tenant_id AND estimate_number = v_num);
  END LOOP;
  RETURN v_num;
END; $$;
REVOKE EXECUTE ON FUNCTION public.next_estimate_number(uuid) FROM anon;

UPDATE public.estimates SET estimate_number = 'QU-4882' WHERE id = '0f52425f-79f1-415a-b2aa-c9d9222e9577' AND estimate_number = 'QU-00024';
UPDATE public.estimates SET estimate_number = 'QU-4883' WHERE id = 'c06247ec-bff1-4bae-82b9-195375bcf0c6' AND estimate_number = 'QU-00025';
UPDATE public.invoicing_settings SET next_estimate_number = 4884 WHERE tenant_id = '75cc6a9e-9d17-4268-92ee-8b595c842dee' AND next_estimate_number < 4884;