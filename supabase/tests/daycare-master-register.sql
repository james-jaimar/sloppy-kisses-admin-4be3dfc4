-- Read-only live import regressions: every row must return passed=true.
WITH batch AS (
 SELECT evidence FROM public.import_source_evidence
 WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee' AND batch='daycare-master-2026-11-23' AND booking_id IS NULL
), mapped AS (
 SELECT m.* FROM batch b CROSS JOIN LATERAL jsonb_to_recordset(b.evidence->'mappings')
 AS m(customer_number text,source_pet text,pet_id uuid,enrolment_id uuid,selected_days text[],source_rows integer[])
), enrolments AS (
 SELECT e.* FROM public.daycare_enrolments e JOIN mapped m ON m.enrolment_id=e.id
), attendance AS (
 SELECT a.* FROM public.daycare_attendance a JOIN mapped m ON m.pet_id=a.pet_id
 WHERE a.attendance_date BETWEEN '2026-11-23' AND '2026-11-27'
)
SELECT '149 distinct dogs, not 150 duplicated rows' AS rule,
 (SELECT count(*)=149 AND count(DISTINCT pet_id)=149 FROM mapped) AS passed
UNION ALL SELECT '109 customer accounts', (SELECT count(DISTINCT customer_id)=109 FROM enrolments)
UNION ALL SELECT 'Two new customers and nine new pets',
 (SELECT count(*)=2 FROM public.customers WHERE import_batch='daycare-master-2026-11-23') AND
 (SELECT count(*)=9 FROM public.pets WHERE import_batch='daycare-master-2026-11-23')
UNION ALL SELECT 'Active from 23 November, correctly owned and no retrospective invoice',
 (SELECT count(*)=149 AND bool_and(e.active AND e.start_date='2026-11-23' AND e.invoice_id IS NULL AND e.customer_id=p.customer_id AND e.tenant_id=p.tenant_id AND p.species='dog') FROM enrolments e JOIN public.pets p ON p.id=e.pet_id)
UNION ALL SELECT 'Configured plan days match every selected weekday',
 (SELECT count(*)=149 AND bool_and(p.active AND p.days_per_week=cardinality(e.selected_days) AND p.tenant_id=e.tenant_id) FROM enrolments e JOIN public.daycare_plans p ON p.id=e.daycare_plan_id)
UNION ALL SELECT '240 expected visits, never falsely checked in',
 (SELECT count(*)=240 AND bool_and(expected AND status='expected' AND checked_in_at IS NULL AND checked_out_at IS NULL) FROM attendance)
UNION ALL SELECT 'Monday 47, Tuesday 45, Wednesday 55, Thursday 41, Friday 52',
 NOT EXISTS (SELECT 1 FROM (VALUES ('2026-11-23'::date,47),('2026-11-24'::date,45),('2026-11-25'::date,55),('2026-11-26'::date,41),('2026-11-27'::date,52)) d(day,dogs) WHERE (SELECT count(*) FROM attendance WHERE attendance_date=d.day)<>d.dogs)
UNION ALL SELECT 'Every visit matches its saved enrolment weekday',
 (SELECT count(*)=240 AND bool_and((ARRAY['sun','mon','tue','wed','thu','fri','sat'])[extract(dow FROM a.attendance_date)::int+1]=ANY(e.selected_days) AND a.customer_id=e.customer_id) FROM attendance a JOIN enrolments e ON e.pet_id=a.pet_id)
UNION ALL SELECT 'Zoey source rows 56/57 map to one enrolment',
 (SELECT count(*)=1 AND bool_and(source_rows=ARRAY[56,57]) FROM mapped WHERE customer_number='SK03359' AND source_pet='Zoey')
UNION ALL SELECT 'Tatertot Thursday typo corrected',
 (SELECT count(*)=1 AND bool_and(selected_days=ARRAY['mon','thu']) FROM mapped WHERE customer_number='SK04526' AND source_pet='Tatertot')
UNION ALL SELECT 'Ocean and Knox weekdays explicitly provisional',
 (SELECT count(*)=2 AND bool_and(e.notes LIKE '%Weekday confirmation needed:%' AND e.notes LIKE '%provisional%') FROM enrolments e JOIN mapped m ON m.enrolment_id=e.id WHERE m.customer_number IN ('SK04651','SK05010') AND m.source_pet IN ('Ocean','Knox'))
UNION ALL SELECT 'Cooper bee allergy retained on pet and attendance',
 (SELECT count(*)=1 AND bool_and(p.medical_notes ILIKE '%allergic to bees%' AND e.notes ILIKE '%allergic to bees%') FROM mapped m JOIN public.pets p ON p.id=m.pet_id JOIN enrolments e ON e.id=m.enrolment_id WHERE m.customer_number='SK00649' AND m.source_pet='Cooper')
UNION ALL SELECT 'Three transport and two repeat grooming requests visible',
 (SELECT count(*)=5 AND bool_and(c.notes_internal LIKE '%'||m.source_pet||'%') FROM enrolments e JOIN mapped m ON m.enrolment_id=e.id JOIN public.customers c ON c.id=e.customer_id WHERE e.notes LIKE '%Transport requested:%' OR e.notes LIKE '%Repeat grooming requested:%')
UNION ALL SELECT 'Kelly and Mila linked to breed-matched profiles without merging duplicates',
 (SELECT count(*)=2 AND bool_and(pet_id=CASE customer_number WHEN 'SK02896' THEN '1d08c2f6-cf66-4f76-932d-6181cc0121bd'::uuid ELSE 'b9e3b536-710d-46a3-bfb8-170f86fed1b6'::uuid END) FROM mapped WHERE (customer_number,source_pet) IN (('SK02896','Kelly'),('SK04618','Mila')))
UNION ALL SELECT 'Import preserved all billing, payment, message and sync state',
 (SELECT count(*)=1 AND bool_and(evidence->'financial_before'=evidence->'financial_after') FROM batch)
UNION ALL SELECT 'Normal pro-rata trigger restored and Xero payment sync off',
 EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.daycare_enrolments'::regclass AND tgname='trg_daycare_enrolments_prorata' AND tgenabled='O') AND
 EXISTS(SELECT 1 FROM public.xero_settings WHERE tenant_id='75cc6a9e-9d17-4268-92ee-8b595c842dee' AND sync_payments=false)
UNION ALL SELECT 'Private evidence retains all 150 original row references',
 (SELECT count(*)=1 AND bool_and(jsonb_array_length(evidence->'source_rows')=150) FROM batch);