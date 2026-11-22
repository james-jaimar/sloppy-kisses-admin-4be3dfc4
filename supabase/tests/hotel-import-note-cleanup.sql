-- Read-only post-cleanup regression for the fixed 22 Nov 2026 import batch.
-- Run with the database owner. A failed rule raises division-by-zero.
WITH archive AS (
 SELECT * FROM public.import_source_evidence
 WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee'
 AND batch='hotel-sheet-2026-11-22'
), checks AS (
 SELECT 'all original spreadsheet rows preserved privately' AS rule,
   count(*)=123 AND sum(jsonb_array_length(evidence->'raw_sheet_rows'))=184 AS passed
 FROM archive
 UNION ALL
 SELECT 'customers and staff cannot read the evidence archive',
   NOT has_table_privilege('anon','public.import_source_evidence','SELECT')
   AND NOT has_table_privilege('authenticated','public.import_source_evidence','SELECT')
   AND has_table_privilege('service_role','public.import_source_evidence','SELECT')
   AND (SELECT relrowsecurity FROM pg_class WHERE oid='public.import_source_evidence'::regclass)
   AND NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
     AND tablename='import_source_evidence' AND roles IS DISTINCT FROM ARRAY['service_role']::name[])
 UNION ALL
 SELECT 'booking source arrays are removed from operational notes',
   NOT EXISTS (SELECT 1 FROM archive a JOIN public.bookings b ON b.id=a.booking_id
     WHERE b.notes_internal ~ '(?n)^Row [0-9]+: \['
     OR b.notes_internal LIKE '%[hotel-sheet-2026-11-22:row:%')
 UNION ALL
 SELECT 'hotel intake source arrays are removed from operational notes',
   NOT EXISTS (SELECT 1 FROM archive a JOIN public.hotel_booking_details h ON h.booking_id=a.booking_id
     WHERE h.additional_notes ~ '(?n)^Row [0-9]+: \['
     OR h.additional_notes LIKE '%[hotel-sheet-2026-11-22:row:%')
 UNION ALL
 SELECT 'imported quote notes contain no private source evidence',
   count(*)=117 AND bool_and(e.notes IS NULL)
 FROM archive a JOIN public.estimates e ON e.booking_id=a.booking_id
 WHERE e.created_via='hotel_sheet_import'
 UNION ALL
 SELECT 'invoice source arrays are removed without changing balances',
   count(*)=67 AND sum(i.total)=511024.22
   AND sum(i.amount_paid)=445228.47 AND sum(i.balance_due)=65795.75
   AND bool_and(i.notes !~ '(?n)^Row [0-9]+: \[')
 FROM archive a CROSS JOIN LATERAL jsonb_array_elements(a.evidence->'original_invoices') saved
 JOIN public.invoices i ON i.id=(saved->>'id')::uuid
 UNION ALL
 SELECT 'genuine spreadsheet care notes remain available to staff',
   EXISTS (SELECT 1 FROM archive a JOIN public.bookings b ON b.id=a.booking_id
     WHERE EXISTS (SELECT 1 FROM jsonb_array_elements(a.evidence->'raw_sheet_rows') row_data
       WHERE row_data->'values'->>14='waiting for vaccinations and trial day')
     AND position('waiting for vaccinations and trial day' in b.notes_internal)>0)
 UNION ALL
 SELECT 'public quote data contains no raw spreadsheet rows',
   count(*)>0 AND bool_and(
     jsonb_build_object('notes',e.notes,'extras',e.extras)::text !~ 'Row [0-9]+: '
     AND NOT (coalesce(e.extras->'legacy_hotel_import','{}') ? 'raw_sheet_rows'))
 FROM archive a JOIN public.estimates e ON e.booking_id=a.booking_id
 WHERE e.created_via='hotel_sheet_import' AND e.public_token IS NOT NULL
)
SELECT rule, 1 / CASE WHEN passed THEN 1 ELSE 0 END AS passed FROM checks;