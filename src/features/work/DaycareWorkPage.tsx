import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, Check, Loader2, LogIn, LogOut, PawPrint, StickyNote } from "lucide-react";
import { WorkTopBar } from "./WorkTopBar";
import { useWorkDepts } from "./useWorkDepts";
import { DayNoteSheet } from "./DayNoteSheet";
import { useDaycareDayNotes } from "@/features/daycare/dayNotesQueries";
import {
  isoDate, useAttendanceForDay, useExpectedForDay, useUpsertAttendance,
  useDaycareWorkflowSettings,
  type AttendanceRow,
} from "@/features/daycare/queries";
import { StayPlayLane } from "@/features/daycare/StayPlayLane";

export default function DaycareWorkPage() {
  const { tenantId, canAddDaycareNotes } = useWorkDepts();
  const [day, setDay] = useState(() => new Date());
  const dateIso = isoDate(day);
  const [noteFor, setNoteFor] = useState<{ petId: string; petName: string; customerId: string | null } | null>(null);

  const expected = useExpectedForDay(tenantId, day);
  const attendanceQ = useAttendanceForDay(tenantId, day);
  const upsert = useUpsertAttendance(tenantId ?? "");
  const settingsQ = useDaycareWorkflowSettings(tenantId);
  const notesQ = useDaycareDayNotes(tenantId, dateIso);

  const notesByPet = useMemo(() => {
    const m = new Map<string, DaycareDayNote[]>();
    for (const n of notesQ.data ?? []) {
      const list = m.get(n.pet_id) ?? [];
      list.push(n);
      m.set(n.pet_id, list);
    }
    return m;
  }, [notesQ.data]);

  const byPet = useMemo(() => {
    const m = new Map<string, AttendanceRow>();
    for (const r of attendanceQ.data ?? []) m.set(r.pet_id, r);
    return m;
  }, [attendanceQ.data]);

  const rows = useMemo(() => {
    const seen = new Set(expected.items.map((i) => i.pet_id));
    const extras = (attendanceQ.data ?? [])
      .filter((a) => !seen.has(a.pet_id))
      .map((a) => ({
        key: `walkin:${a.id}`,
        pet_id: a.pet_id,
        customer_id: a.customer_id,
        pet_name: a.pet?.name ?? "Unknown pet",
        customer_name: a.customer?.full_name ?? "",
        plan_name: null as string | null,
      }));
    return [...expected.items, ...extras];
  }, [expected.items, attendanceQ.data]);

  const inCount = rows.filter((r) => byPet.get(r.pet_id)?.status === "checked_in").length;

  async function mark(petId: string, customerId: string, status: "checked_in" | "checked_out") {
    const existing = byPet.get(petId);
    const now = new Date().toISOString();
    try {
      await upsert.mutateAsync({
        id: existing?.id,
        pet_id: petId,
        customer_id: customerId,
        attendance_date: dateIso,
        status,
        checked_in_at: status === "checked_in" ? (existing?.checked_in_at ?? now) : (existing?.checked_in_at ?? null),
        checked_out_at: status === "checked_out" ? now : (existing?.checked_out_at ?? null),
        notes: existing?.notes ?? null,
      });
      toast.success(status === "checked_in" ? "Checked in" : "Checked out");
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't save");
    }
  }

  const loading = expected.isLoading || attendanceQ.isLoading;

  return (
    <>
      <WorkTopBar
        title="Daycare"
        subtitle={`${inCount} in · ${rows.length} expected`}
        day={day}
        onDayChange={setDay}
      />
      <div className="mx-auto max-w-5xl space-y-3 p-4">
        {tenantId && (
          <StayPlayLane
            tenantId={tenantId}
            day={day}
            graceMinutes={settingsQ.data?.stay_play_grace_minutes ?? 15}
            compact
          />
        )}
        {loading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Loading…
          </div>
        )}
        {!loading && rows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <PawPrint className="mx-auto h-10 w-10 text-muted-foreground" />
            <p className="mt-3 text-base font-semibold">No dogs expected</p>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
        {rows.map((r) => {
          const att = byPet.get(r.pet_id);
          const isIn = att?.status === "checked_in";
          const isOut = att?.status === "checked_out";
          const notes = notesByPet.get(r.pet_id) ?? [];
          return (
            <div key={r.key} className="rounded-2xl border border-border bg-white p-4">
              <div className="flex items-center gap-3">
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-sk-coral-soft text-lg font-bold text-sk-coral-dark">
                  {r.pet_name.slice(0, 1).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-lg font-bold">{r.pet_name}</span>
                    {isOut && <Check className="h-5 w-5 shrink-0 text-sk-green" />}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {r.customer_name}{r.plan_name ? ` · ${r.plan_name}` : ""}
                  </div>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => mark(r.pet_id, r.customer_id, "checked_in")}
                  disabled={upsert.isPending}
                  className={`flex min-h-[56px] items-center justify-center gap-2 rounded-2xl text-base font-bold disabled:opacity-60 ${
                    isIn ? "bg-sk-green-soft text-sk-green" : "bg-sk-green text-white"
                  }`}
                >
                  <LogIn className="h-5 w-5" /> In
                </button>
                <button
                  onClick={() => mark(r.pet_id, r.customer_id, "checked_out")}
                  disabled={upsert.isPending}
                  className={`flex min-h-[56px] items-center justify-center gap-2 rounded-2xl text-base font-bold disabled:opacity-60 ${
                    isOut ? "bg-muted text-muted-foreground" : "bg-sk-turquoise text-white"
                  }`}
                >
                  <LogOut className="h-5 w-5" /> Out
                </button>
              </div>
              {canAddDaycareNotes && (
                <button
                  onClick={() => setNoteFor({ petId: r.pet_id, petName: r.pet_name, customerId: r.customer_id })}
                  className="mt-2 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-border text-base font-semibold active:bg-muted"
                >
                  <StickyNote className="h-5 w-5" /> Add note
                </button>
              )}
              {notes.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {notes.map((n: any) => (
                    <li
                      key={n.id}
                      className={`rounded-xl border p-2.5 text-sm ${
                        n.office_flag && !n.handled_at
                          ? "border-sk-orange bg-sk-orange-soft"
                          : "border-border bg-muted/40"
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        {n.office_flag && <Bell className="h-3 w-3" />}
                        <span>{n.author?.full_name ?? n.author?.email ?? "Staff"}</span>
                        <span>·</span>
                        <span>{new Date(n.created_at).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" })}</span>
                        {n.handled_at && <span>· handled</span>}
                      </div>
                      <div className="whitespace-pre-wrap">{n.body}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
        </div>
      </div>
      {noteFor && tenantId && (
        <DayNoteSheet
          tenantId={tenantId}
          petId={noteFor.petId}
          petName={noteFor.petName}
          customerId={noteFor.customerId}
          dateIso={dateIso}
          onClose={() => setNoteFor(null)}
        />
      )}
    </>
  );
}