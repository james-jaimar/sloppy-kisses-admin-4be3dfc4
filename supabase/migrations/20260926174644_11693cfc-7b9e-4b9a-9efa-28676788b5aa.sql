SET LOCAL session_replication_role = replica;

CREATE TEMP TABLE _mv ON COMMIT DROP AS
  SELECT id FROM public.bookings WHERE start_date BETWEEN '2026-09-01' AND '2026-09-13';

UPDATE public.bookings SET start_at = start_at + interval '28 days', end_at = end_at + interval '28 days',
  start_date = start_date + 28, end_date = end_date + 28,
  payment_hold_expires_at = payment_hold_expires_at + interval '28 days'
WHERE id IN (SELECT id FROM _mv);

UPDATE public.care_rounds SET round_date = round_date + 28, done_at = done_at + interval '28 days' WHERE booking_id IN (SELECT id FROM _mv);
UPDATE public.stay_play_sessions SET session_date = session_date + 28, expected_collect_at = expected_collect_at + interval '28 days', collected_at = collected_at + interval '28 days' WHERE booking_id IN (SELECT id FROM _mv);
UPDATE public.transport_details SET planned_window_start = planned_window_start + interval '28 days', planned_window_end = planned_window_end + interval '28 days', completed_at = completed_at + interval '28 days' WHERE booking_id IN (SELECT id FROM _mv);
UPDATE public.grooming_booking_details SET actual_start_at = actual_start_at + interval '28 days', actual_end_at = actual_end_at + interval '28 days' WHERE booking_id IN (SELECT id FROM _mv);
UPDATE public.grooming_route_stops SET planned_arrival = planned_arrival + interval '28 days', planned_departure = planned_departure + interval '28 days' WHERE booking_id IN (SELECT id FROM _mv);
UPDATE public.grooming_route_runs SET route_date = route_date + 28 WHERE route_date BETWEEN '2026-09-01' AND '2026-09-13';
UPDATE public.hotel_grooming_requests SET window_start = window_start + 28, window_end = window_end + 28, scheduled_at = scheduled_at + interval '28 days' WHERE hotel_booking_id IN (SELECT id FROM _mv);
UPDATE public.daycare_day_notes SET note_date = note_date + 28 WHERE note_date BETWEEN '2026-09-01' AND '2026-09-13';

-- Attendance: move only rows whose target day is free for that pet
UPDATE public.daycare_attendance a SET attendance_date = attendance_date + 28,
  checked_in_at = checked_in_at + interval '28 days', checked_out_at = checked_out_at + interval '28 days'
WHERE a.attendance_date BETWEEN '2026-09-01' AND '2026-09-13'
  AND NOT EXISTS (SELECT 1 FROM public.daycare_attendance b WHERE b.tenant_id = a.tenant_id AND b.pet_id = a.pet_id AND b.attendance_date = a.attendance_date + 28);