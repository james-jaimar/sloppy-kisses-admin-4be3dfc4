DO $$ DECLARE d text; BEGIN
SELECT pg_get_functiondef('public.import_hotel_sheet_20261122(jsonb)'::regprocedure) INTO d;
d:=replace(d,'source_key||E''\n''||r->>''notes''','source_key||E''\n''||(r->>''notes'')');
EXECUTE d;
END $$;