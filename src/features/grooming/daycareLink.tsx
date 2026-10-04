/**
 * Daycare ⇄ Grooming operational link.
 * - Daycare screens show which dogs have a groom today (and when).
 * - Grooming screens show which dogs are in daycare today, so a finished
 *   dog goes back to the daycare floor instead of waiting for its owner.
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Scissors, Undo2, Plus, Home } from "lucide-react";
import { useGroomingBoardBookings } from "./queries";
import { useAttendanceForDay, useExpectedForDay } from "@/features/daycare/queries";
import type { BookingStatus } from "@/features/bookings/queries";

export interface PetGroomToday {
  bookingId: string;
  startAt: string | null;
  status: BookingStatus;
}

const fmtTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—";

/** Pet id → that pet's (earliest) in-house groom on the given day. */
export function useGroomsByPetForDay(tenantId: string | null | undefined, day: Date) {
  const q = useGroomingBoardBookings({ tenantId, day });
  return useMemo(() => {
    const m = new Map<string, PetGroomToday>();
    for (const b of q.data ?? []) {
      for (const p of b.pets) {
        if (!m.has(p.id)) m.set(p.id, { bookingId: b.id, startAt: b.start_at, status: b.status });
      }
    }
    return m;
  }, [q.data]);
}

/** Pets at daycare on the given day: expected (enrolment / swap-in) or on today's
 *  attendance (walk-ins included), minus anyone marked as not arrived. */
export function useDaycarePetIdsForDay(tenantId: string | null | undefined, day: Date) {
  const expected = useExpectedForDay(tenantId, day);
  const att = useAttendanceForDay(tenantId, day);
  return useMemo(() => {
    const s = new Set<string>(expected.items.map((i) => i.pet_id));
    for (const a of att.data ?? []) {
      if (a.status === "not_arrived") s.delete(a.pet_id);
      else s.add(a.pet_id);
    }
    return s;
  }, [expected.items, att.data]);
}

/** Daycare side: "Groom 11:00" chip linking to the booking. */
export function GroomTodayChip({ groom }: { groom: PetGroomToday }) {
  const done = groom.status === "ready" || groom.status === "checked_out" || groom.status === "completed";
  const inSalon = groom.status === "checked_in" || groom.status === "grooming" || groom.status === "in_progress";
  const label = done ? "Groom done" : inSalon ? "In the salon" : `Groom ${fmtTime(groom.startAt)}`;
  return (
    <Link
      to={`/admin/bookings/${groom.bookingId}`}
      state={{ from: "/admin/daycare" }}
      onClick={(e) => e.stopPropagation()}
      title={`Grooming booked ${fmtTime(groom.startAt)}`}
      className={
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold " +
        (done ? "bg-sk-green-soft text-sk-green" : "bg-sk-coral-soft text-sk-coral-dark")
      }
    >
      <Scissors className="h-3 w-3" /> {label}
    </Link>
  );
}

/** Daycare side: one-tap "Add groom" for a dog without a groom today. */
export function AddGroomButton({ onClick, compact }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-2.5 py-1.5 text-xs font-medium hover:bg-sk-surface-muted"
      title="Book a groom for this dog today"
    >
      <Plus className="h-3.5 w-3.5" /> <Scissors className="h-3.5 w-3.5" />
      {!compact && <span>Add groom</span>}
    </button>
  );
}

/** Grooming side: "In daycare" tag; on a Ready card it becomes "Return to daycare". */
export function InDaycareChip({ status }: { status: BookingStatus }) {
  const back = status === "ready";
  return (
    <span
      title={back ? "This dog is in daycare today — take it back to the daycare floor, no need to call the owner." : "This dog is in daycare today"}
      className={
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold " +
        (back ? "bg-sk-orange-soft text-sk-orange" : "bg-sk-turquoise-soft text-sk-turquoise-dark")
      }
    >
      {back ? <Undo2 className="h-3 w-3" /> : <Home className="h-3 w-3" />}
      {back ? "Return to daycare" : "In daycare"}
    </span>
  );
}

/** Sensible start time for a same-day groom: next half hour today, else 09:00. */
export function suggestedGroomStart(day: Date): string {
  const d = new Date(day);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    const n = new Date(now);
    n.setSeconds(0, 0);
    n.setMinutes(n.getMinutes() < 30 ? 30 : 60);
    return n.toISOString();
  }
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}
