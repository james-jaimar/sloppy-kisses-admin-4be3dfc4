DO $$ DECLARE d text; BEGIN
  d := pg_get_functiondef('public.get_public_quote(uuid)'::regprocedure);
  d := replace(d, E'  IF v_e.status = ''draft'' THEN RETURN NULL; END IF;\n', '');
  EXECUTE d;
END $$;
UPDATE public.estimates SET status = 'sent', sent_at = COALESCE(sent_at, now()) WHERE estimate_number = 'QU-00013' AND status = 'draft';